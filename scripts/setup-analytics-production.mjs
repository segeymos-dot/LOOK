#!/usr/bin/env node
/**
 * Apply analytics migration (018) and verify counters.
 * Tries, in order:
 *   1. SUPABASE_DB_URL + pg
 *   2. SUPABASE_ACCESS_TOKEN + Management API database/query
 *   3. SUPABASE_SERVICE_ROLE_KEY + platform_settings bootstrap (no DDL)
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  loadSupabaseAccessToken,
  loadEnvLocal,
  projectRefFromUrl,
  fetchProjectApiKeys,
  pickServiceRoleKey,
  loadVercelProductionEnv,
} from "./supabase-credentials.mjs";
import { loadVercelProductionEnvViaApi } from "./vercel-credentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");
const MIGRATION = resolve(root, "supabase/migrations/018_platform_analytics.sql");

async function loadEnv() {
  const merged = { ...loadEnvLocal(), ...process.env };
  loadVercelProductionEnv([
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
    "SUPABASE_ACCESS_TOKEN",
  ]);
  const vercelApiEnv = await loadVercelProductionEnvViaApi();
  for (const [k, v] of Object.entries(vercelApiEnv)) {
    if (v && !merged[k]) merged[k] = v;
    if (v && !process.env[k]) process.env[k] = v;
  }
  const token = loadSupabaseAccessToken();
  if (token && !merged.SUPABASE_ACCESS_TOKEN) {
    merged.SUPABASE_ACCESS_TOKEN = token;
    process.env.SUPABASE_ACCESS_TOKEN = token;
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (v && !merged[k]) merged[k] = v;
  }
  return merged;
}

async function resolveServiceRoleKey(env, token, projectRef) {
  if (env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return env.SUPABASE_SERVICE_ROLE_KEY.trim();
  }
  if (!token || !projectRef) return null;
  try {
    const keys = await fetchProjectApiKeys(token, projectRef);
    return pickServiceRoleKey(keys);
  } catch {
    return null;
  }
}

function persistServiceRoleLocally(key) {
  if (!key || !existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  if (/^SUPABASE_SERVICE_ROLE_KEY=./m.test(content)) return;
  const line = content.endsWith("\n") ? "" : "\n";
  writeFileSync(envPath, `${content}${line}SUPABASE_SERVICE_ROLE_KEY=${key}\n`);
}

function syncServiceRoleToVercel(key) {
  const vercelBin = resolve(root, "node_modules", ".bin", "vercel");
  if (!key || !existsSync(vercelBin)) return;
  const existing = spawnSync(vercelBin, ["env", "get", "SUPABASE_SERVICE_ROLE_KEY", "production"], {
    cwd: root,
    encoding: "utf8",
  });
  const current = existing.stdout?.trim();
  if (current && !current.includes("Error") && !current.includes("not found")) {
    return;
  }
  spawnSync(
    vercelBin,
    ["env", "add", "SUPABASE_SERVICE_ROLE_KEY", "production", "--value", key, "--yes"],
    { cwd: root, stdio: "inherit" }
  );
}

async function applyViaPg(dbUrl, sql) {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function applyViaManagementApi(token, projectRef, sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${body}`);
  }
}

async function bootstrapSettings(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return false;

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date().toISOString();
  const { error } = await admin.from("platform_settings").upsert(
    [
      { key: "analytics_page_views", value: "0", updated_at: now },
      { key: "analytics_unique_visitors", value: "0", updated_at: now },
    ],
    { onConflict: "key" }
  );

  if (error) throw new Error(error.message);
  return true;
}

async function verify(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;

  const res = await fetch(`${url}/rest/v1/platform_analytics?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (res.status === 404 || text.includes("does not exist")) {
    console.log("platform_analytics table: not present (settings fallback active)");
  } else {
    console.log("platform_analytics table: present");
  }
}

async function main() {
  const env = await loadEnv();
  const sql = readFileSync(MIGRATION, "utf8");
  const projectRef = env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]
    : null;

  const dbUrl = env.SUPABASE_DB_URL || env.DATABASE_URL;
  const token = env.SUPABASE_ACCESS_TOKEN;
  const projectRefResolved = projectRef || (env.NEXT_PUBLIC_SUPABASE_URL ? projectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL) : null);

  const serviceRole = await resolveServiceRoleKey(env, token, projectRefResolved);
  if (serviceRole) {
    env.SUPABASE_SERVICE_ROLE_KEY = serviceRole;
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRole;
    persistServiceRoleLocally(serviceRole);
    syncServiceRoleToVercel(serviceRole);
    console.log("Service role key resolved and synced to Vercel (if missing).");
  }

  if (dbUrl) {
    console.log("Applying migration 018 via PostgreSQL…");
    await applyViaPg(dbUrl, sql);
    console.log("Migration 018 applied via PostgreSQL.");
    await verify(env);
    return;
  }

  if (token && projectRefResolved) {
    console.log("Applying migration 018 via Supabase Management API…");
    await applyViaManagementApi(token, projectRefResolved, sql);
    console.log("Migration 018 applied via Management API.");
    await verify(env);
    return;
  }

  if (await bootstrapSettings(env)) {
    console.log(
      "Migration 018 not applied (no DB URL / access token). Analytics bootstrap via platform_settings completed."
    );
    await verify(env);
    return;
  }

  console.error(
    "Cannot apply analytics setup. Set one of:\n" +
      "  SUPABASE_DB_URL\n" +
      "  SUPABASE_ACCESS_TOKEN\n" +
      "  SUPABASE_SERVICE_ROLE_KEY (settings fallback only)"
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
