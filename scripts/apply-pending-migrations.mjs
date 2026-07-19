#!/usr/bin/env node
/**
 * Apply pending Supabase migrations in order (009–025).
 * Credentials (no secrets printed): .env.local, Vercel CLI, Vercel API, ~/.config/supabase/access-token
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadSupabaseAccessToken,
  loadEnvLocal,
  projectRefFromUrl,
  loadVercelProductionEnv,
} from "./supabase-credentials.mjs";
import { loadVercelProductionEnvViaApi } from "./vercel-credentials.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = resolve(root, "supabase/migrations");

/** Migrations to apply in strict order (includes partial/missing from audit). */
const PENDING_ORDER = [
  "009_request_lifecycle_rpc.sql",
  "013_message_read.sql",
  "014_conversation_inbox.sql",
  "015_fix_test_user_roles.sql",
  "016_cancel_request_rpc.sql",
  "017_order_work_lifecycle.sql",
  "018_platform_analytics.sql",
  "019_category_name_en.sql",
  "020_messages_attachment_columns.sql",
  "021_payment_checkout.sql",
  "022_order_payment_foundation.sql",
  "023_submit_work_payment_guard.sql",
  "024_order_payment_lifecycle.sql",
  "025_confirm_stripe_payment.sql",
];

async function loadCredentials() {
  const merged = { ...loadEnvLocal(), ...process.env };
  loadVercelProductionEnv(["SUPABASE_DB_URL", "SUPABASE_ACCESS_TOKEN", "NEXT_PUBLIC_SUPABASE_URL"]);
  const vercelApi = await loadVercelProductionEnvViaApi();
  for (const [k, v] of Object.entries(vercelApi)) {
    if (v && !merged[k]) merged[k] = v;
    if (v && !process.env[k]) process.env[k] = v;
  }
  const token =
    merged.SUPABASE_ACCESS_TOKEN?.trim() ||
    process.env.SUPABASE_ACCESS_TOKEN?.trim() ||
    loadSupabaseAccessToken();
  const dbUrl = merged.SUPABASE_DB_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  const url = merged.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return { token, dbUrl, url };
}

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
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${body.slice(0, 300)}`);
  }
}

async function applyViaPg(dbUrl, sql) {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function applyFile(creds, file) {
  const path = resolve(migrationsDir, file);
  const sql = readFileSync(path, "utf8");
  if (creds.dbUrl) {
    await applyViaPg(creds.dbUrl, sql);
    return "pg";
  }
  if (creds.token && creds.url) {
    const ref = projectRefFromUrl(creds.url);
    await applyViaApi(creds.token, ref, sql);
    return "api";
  }
  throw new Error("No SUPABASE_DB_URL or SUPABASE_ACCESS_TOKEN available");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const only = process.argv.find((a) => a.startsWith("--from="))?.slice(7);
  const creds = await loadCredentials();

  console.log("Credential sources:");
  console.log(`  SUPABASE_DB_URL: ${creds.dbUrl ? "yes" : "no"}`);
  console.log(`  SUPABASE_ACCESS_TOKEN: ${creds.token ? "yes" : "no"}`);
  console.log(`  Project URL: ${creds.url ? creds.url.replace(/https:\/\/([^.]+).*/, "https://$1...") : "no"}`);
  console.log("");

  if (!creds.dbUrl && !creds.token) {
    console.error("Cannot apply automatically — add SUPABASE_DB_URL or SUPABASE_ACCESS_TOKEN.");
    console.error("See deployment report for manual SQL Editor steps.");
    process.exit(2);
  }

  const files = only ? PENDING_ORDER.slice(PENDING_ORDER.indexOf(only)) : PENDING_ORDER;
  const applied = [];
  const failed = [];

  for (const file of files) {
    if (!readdirSync(migrationsDir).includes(file)) {
      console.error(`Missing file: ${file}`);
      failed.push({ file, error: "file not found" });
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] would apply ${file}`);
      applied.push(file);
      continue;
    }
    process.stdout.write(`Applying ${file}… `);
    try {
      const method = await applyFile(creds, file);
      console.log(`OK (${method})`);
      applied.push(file);
    } catch (e) {
      console.log("FAILED");
      console.error(`  ${e.message}`);
      failed.push({ file, error: e.message });
      break;
    }
  }

  console.log("");
  console.log(`Applied: ${applied.length}/${files.length}`);
  if (failed.length) {
    console.log("Stopped at:", failed[0].file);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
