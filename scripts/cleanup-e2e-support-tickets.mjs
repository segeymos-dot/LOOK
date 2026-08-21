#!/usr/bin/env node
/**
 * Delete LOOK admin-support tickets created by E2E/smoke checks.
 *
 * Safety:
 * - Requires SUPABASE_DB_URL (never invents credentials)
 * - Refuses production project ref unless LOOK_ALLOW_SUPPORT_E2E_CLEANUP_PROD=1
 * - Deletes ONLY rows whose subject matches ^E2E( |$)
 *
 * Usage:
 *   node scripts/cleanup-e2e-support-tickets.mjs --env .env.staging.local
 *   node scripts/cleanup-e2e-support-tickets.mjs --env .env.staging.local --dry-run
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PRODUCTION_PROJECT_REF = "qdiyorwbtffknsstmxju";
const E2E_SUBJECT_RE = "^E2E( |$)";

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const key = t.slice(0, i).trim();
    let value = t.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function projectRefFromUrl(url) {
  try {
    return new URL(url).hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  let envPath = ".env.staging.local";
  let dryRun = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--env") envPath = argv[++i] ?? envPath;
  }
  return { envPath: resolve(process.cwd(), envPath), dryRun };
}

async function main() {
  const { envPath, dryRun } = parseArgs(process.argv);
  const fileEnv = loadEnvFile(envPath);
  const dbUrl =
    process.env.SUPABASE_DB_URL?.trim() ||
    fileEnv.SUPABASE_DB_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    fileEnv.DATABASE_URL?.trim();
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    fileEnv.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";

  if (!dbUrl) {
    console.error(`Missing SUPABASE_DB_URL (checked ${envPath} and process.env).`);
    process.exit(1);
  }

  const ref = projectRefFromUrl(supabaseUrl);
  const isProd = ref === PRODUCTION_PROJECT_REF;
  if (isProd && process.env.LOOK_ALLOW_SUPPORT_E2E_CLEANUP_PROD !== "1") {
    console.error(
      `Refusing cleanup on production project ${PRODUCTION_PROJECT_REF}.\n` +
        `Set LOOK_ALLOW_SUPPORT_E2E_CLEANUP_PROD=1 only for intentional prod cleanup.`
    );
    process.exit(1);
  }

  const { Client } = await import("pg");
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const { rows } = await client.query(
      `select id, subject, user_role, status, created_at
       from public.admin_support_messages
       where subject ~ $1
       order by created_at`,
      [E2E_SUBJECT_RE]
    );

    console.log(
      `${dryRun ? "DRY-RUN" : "CLEANUP"} target=${ref ?? "unknown"} matches=${rows.length}`
    );
    for (const row of rows) {
      console.log(
        `- ${row.id} | ${row.user_role} | ${row.status} | ${row.subject}`
      );
    }

    if (dryRun || rows.length === 0) {
      return;
    }

    const deleted = await client.query(
      `delete from public.admin_support_messages
       where subject ~ $1
       returning id, subject`,
      [E2E_SUBJECT_RE]
    );
    console.log(`Deleted ${deleted.rowCount} ticket(s) (thread messages CASCADE).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
