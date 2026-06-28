#!/usr/bin/env node
/**
 * Try all known credential sources to apply migration 018. No secrets printed.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadSupabaseAccessToken,
  loadEnvLocal,
  projectRefFromUrl,
  loadVercelProductionEnv,
} from "./supabase-credentials.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = resolve(root, "supabase/migrations/018_platform_analytics.sql");

async function applyViaApi(token, projectRef, sql) {
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
  if (!res.ok) throw new Error(`${res.status}: ${body.slice(0, 120)}`);
}

async function verifyTable(url, anonKey) {
  const res = await fetch(`${url}/rest/v1/platform_analytics?select=id&limit=1`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  const text = await res.text();
  return res.ok && !text.includes("does not exist");
}

async function main() {
  loadVercelProductionEnv(["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_URL"]);
  const local = loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || local.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || local.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token =
    process.env.SUPABASE_ACCESS_TOKEN ||
    local.SUPABASE_ACCESS_TOKEN ||
    loadSupabaseAccessToken();

  console.log("token:", token ? `yes (${token.length})` : "no");
  console.log("db url:", (process.env.SUPABASE_DB_URL || local.SUPABASE_DB_URL) ? "yes" : "no");

  if (url && anon && (await verifyTable(url, anon))) {
    console.log("platform_analytics already exists");
    process.exit(0);
  }

  if (!token || !url) {
    console.error("No credentials available");
    process.exit(1);
  }

  const projectRef = projectRefFromUrl(url);
  const sql = readFileSync(migrationPath, "utf8");
  await applyViaApi(token, projectRef, sql);
  console.log("Migration applied");

  if (await verifyTable(url, anon)) {
    console.log("Verified: platform_analytics exists");
  } else {
    console.error("Verification failed");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
