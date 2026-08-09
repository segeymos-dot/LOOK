#!/usr/bin/env node
/**
 * Apply supabase/migrations 001–040 to LOOK Staging ONLY.
 * Credentials: .env.staging.local Session pooler URI (SUPABASE_DB_URL).
 * Never constructs or uses direct db.<ref>.supabase.co hosts.
 * Does not print secrets. Stops on first error.
 *
 * Save pooler URI first:
 *   node scripts/save-staging-pooler-uri.mjs
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stagingEnvPath = resolve(root, ".env.staging.local");
const migrationsDir = resolve(root, "supabase/migrations");

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = value;
  }
  return out;
}

function projectRefFromSupabaseUrl(url) {
  return new URL(url).hostname.split(".")[0];
}

function redact(msg) {
  return String(msg)
    .replace(/postgres(?:ql)?:\/\/[^\s)'"]+/gi, "[redacted-db-url]")
    .replace(/db\.[a-z0-9-]+\.supabase\.co/gi, "db.[redacted].supabase.co")
    .replace(/postgres\.[a-z0-9-]+/gi, "postgres.[redacted]")
    .replace(
      /aws-0-[a-z0-9-]+\.pooler\.supabase\.com/gi,
      "[redacted].pooler.supabase.com"
    );
}

function assertStagingOnly(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const projectId = env.SUPABASE_PROJECT_ID?.trim();
  if (!url || !projectId) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_PROJECT_ID in .env.staging.local"
    );
  }
  const ref = projectRefFromSupabaseUrl(url);
  if (ref !== projectId) {
    throw new Error("Staging URL ref does not match SUPABASE_PROJECT_ID — aborting");
  }

  const local = loadEnvFile(resolve(root, ".env.local"));
  if (local.NEXT_PUBLIC_SUPABASE_URL?.trim() === url) {
    throw new Error(
      "Staging URL equals .env.local URL — aborting (would hit local/production)"
    );
  }
  return { url, projectId, ref };
}

function assertSessionPoolerUri(uri, ref) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("SUPABASE_DB_URL is not a valid URI");
  }
  if (!/^postgres(ql)?:$/i.test(parsed.protocol)) {
    throw new Error("SUPABASE_DB_URL must be postgresql://");
  }
  const host = parsed.hostname.toLowerCase();
  if (host.startsWith("db.") && host.endsWith(".supabase.co")) {
    throw new Error(
      "Direct db.<ref>.supabase.co host is forbidden — use Session pooler URI (run save-staging-pooler-uri.mjs)"
    );
  }
  if (!host.includes("pooler.supabase.com")) {
    throw new Error(
      "SUPABASE_DB_URL must use *.pooler.supabase.com — run: node scripts/save-staging-pooler-uri.mjs"
    );
  }
  const hay = `${parsed.username} ${parsed.hostname} ${uri}`;
  if (!hay.includes(ref)) {
    throw new Error(
      "Pooler URI does not contain staging Project ID — refusing wrong project"
    );
  }
}

function listMigrations() {
  return readdirSync(migrationsDir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();
}

async function applySql(dbUrl, sql) {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function verifySchema(dbUrl) {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const tables = await client.query(
      `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
      order by table_name
    `,
      [["profiles", "requests", "offers", "payments", "reviews", "order_disputes"]]
    );
    const cols = await client.query(
      `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'requests'
        and column_name = any($1::text[])
      order by column_name
    `,
      [["archived_at", "trashed_at"]]
    );
    return {
      tables: tables.rows.map((r) => r.table_name),
      archiveCols: cols.rows.map((r) => r.column_name),
    };
  } finally {
    await client.end();
  }
}

async function main() {
  console.log("Target: LOOK Staging via .env.staging.local Session pooler only");
  const env = loadEnvFile(stagingEnvPath);
  const { ref } = assertStagingOnly(env);
  console.log("OK: URL ref matches Project ID");
  console.log("OK: differs from .env.local");

  const dbUrl = (env.SUPABASE_DB_URL || env.DATABASE_URL || "").trim();
  if (!dbUrl) {
    throw new Error(
      "Missing SUPABASE_DB_URL — run: node scripts/save-staging-pooler-uri.mjs"
    );
  }
  assertSessionPoolerUri(dbUrl, ref);
  console.log("OK: SUPABASE_DB_URL is Session/pooler URI for staging Project ID");

  try {
    await applySql(dbUrl, "select 1");
    console.log("OK: connected via pooler");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Cannot connect via pooler. ${redact(msg)}`);
  }

  const files = listMigrations().filter((f) => {
    const n = Number(f.slice(0, 3));
    return n >= 1 && n <= 40;
  });
  console.log(`Migrations to apply: ${files.length} (001–040)`);

  const succeeded = [];
  let failed = null;

  for (const file of files) {
    process.stdout.write(`Applying ${file}… `);
    try {
      const sql = readFileSync(resolve(migrationsDir, file), "utf8");
      await applySql(dbUrl, sql);
      console.log("OK");
      succeeded.push(file);
    } catch (e) {
      console.log("FAILED");
      const msg = e instanceof Error ? e.message : String(e);
      const safe = redact(msg);
      console.error(`  ${safe}`);
      failed = { file, error: safe };
      break;
    }
  }

  console.log("");
  console.log(`Succeeded: ${succeeded.length}/${files.length}`);
  if (failed) {
    console.log(`Failed: ${failed.file}`);
    console.log(
      `Not applied after failure: ${files.length - succeeded.length - 1}`
    );
    process.exit(1);
  }

  const schema = await verifySchema(dbUrl);
  const required = [
    "profiles",
    "requests",
    "offers",
    "payments",
    "reviews",
    "order_disputes",
  ];
  const missingTables = required.filter((t) => !schema.tables.includes(t));
  const missingCols = ["archived_at", "trashed_at"].filter(
    (c) => !schema.archiveCols.includes(c)
  );

  console.log("Core tables present:", schema.tables.join(", ") || "(none)");
  console.log(
    "Order history columns on requests:",
    schema.archiveCols.join(", ") || "(none)"
  );
  if (missingTables.length || missingCols.length) {
    console.error("VERIFY_FAIL", { missingTables, missingCols });
    process.exit(1);
  }
  console.log("VERIFY_PASS: core tables + archive columns OK");
  console.log("No push / no deploy / Stripe keys untouched");
}

main().catch((e) => {
  console.error(redact(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
