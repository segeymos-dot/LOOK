#!/usr/bin/env node
/**
 * Apply 052_admin_platform_stats.sql to production LOOK (qdiyorwbtffknsstmxju)
 * and soft-trash the known duplicate test order ba00bb61-… (keep 627a4fe2-…).
 *
 * Usage:
 *   node scripts/apply-prod-052-admin-platform-stats.mjs --dry-run
 *   node scripts/apply-prod-052-admin-platform-stats.mjs
 *   node scripts/apply-prod-052-admin-platform-stats.mjs --trash-only
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadEnvLocal,
  loadSupabaseAccessToken,
  projectRefFromUrl,
} from "./supabase-credentials.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = "qdiyorwbtffknsstmxju";
const FORBIDDEN = "iwsybuugiyzimvdrelag";
const MIGRATION = "052_admin_platform_stats.sql";
const KEEP_ORDER = "627a4fe2-682a-4276-91c8-39dea1759301";
const TRASH_ORDER = "ba00bb61-43a2-4c7c-9a48-09ed9283fdc8";

async function sqlViaApi(token, ref, query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${res.status}: ${text.slice(0, 800)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function sqlViaPg(dbUrl, query) {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await client.query(query);
  } finally {
    await client.end();
  }
}

function row0(r) {
  if (!r) return null;
  if (Array.isArray(r)) return r[0] ?? null;
  if (Array.isArray(r.rows)) return r.rows[0] ?? null;
  return r;
}

const dryRun = process.argv.includes("--dry-run");
const trashOnly = process.argv.includes("--trash-only");
const local = loadEnvLocal();
const token = (local.SUPABASE_ACCESS_TOKEN || loadSupabaseAccessToken() || "").trim();
const dbUrl = (local.SUPABASE_DB_URL || process.env.SUPABASE_DB_URL || "").trim();
const ref = projectRefFromUrl(local.NEXT_PUBLIC_SUPABASE_URL);
if (ref !== EXPECTED) throw new Error(`ref mismatch: ${ref}`);
if (ref === FORBIDDEN) throw new Error("refuses staging");

async function runSql(query) {
  if (dbUrl) {
    if (!dbUrl.includes(EXPECTED)) {
      throw new Error("SUPABASE_DB_URL must point at production project");
    }
    return sqlViaPg(dbUrl, query);
  }
  if (!token) throw new Error("Need SUPABASE_DB_URL or SUPABASE_ACCESS_TOKEN");
  return sqlViaApi(token, ref, query);
}

console.log({
  dryRun,
  trashOnly,
  hasDbUrl: Boolean(dbUrl),
  hasToken: Boolean(token),
  ref,
});

if (!trashOnly) {
  const sqlText = readFileSync(resolve(root, "supabase/migrations", MIGRATION), "utf8");
  console.log(`migration ${MIGRATION} bytes=${sqlText.length}`);
  if (!dryRun) {
    await runSql(sqlText);
    console.log("migration OK");
  }
}

const verifyDup = `
SELECT id::text, title, created_at, trashed_at
FROM public.requests
WHERE id IN ('${KEEP_ORDER}', '${TRASH_ORDER}')
ORDER BY created_at;
`;

const before = await runSql(verifyDup);
console.log("orders_before", before);

if (!dryRun) {
  const trashSql = `
UPDATE public.requests
SET trashed_at = COALESCE(trashed_at, NOW()),
    updated_at = NOW()
WHERE id = '${TRASH_ORDER}'
  AND trashed_at IS NULL
RETURNING id::text, trashed_at;
`;
  const trashed = await runSql(trashSql);
  console.log("trashed", trashed);

  const counts = await runSql(`
SELECT
  (SELECT COUNT(*) FROM public.requests WHERE trashed_at IS NULL) AS total_orders,
  public.get_admin_platform_stats() AS stats;
`);
  console.log("after", row0(counts));
}

console.log("done");
