#!/usr/bin/env node
/**
 * Apply 066_ensure_legal_consent_columns.sql to production LOOK.
 * Refuses non-production project ref.
 *
 * Does not print secrets. Prints only column presence verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProductionEnvFromVercel } from "./load-vercel-production-env.mjs";
import {
  loadEnvLocal,
  loadSupabaseAccessToken,
  projectRefFromUrl,
} from "./supabase-credentials.mjs";
import { loadVercelProductionEnvViaApi } from "./vercel-credentials.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = "qdiyorwbtffknsstmxju";
const MIGRATION = "066_ensure_legal_consent_columns.sql";

loadProductionEnvFromVercel();
const local = loadEnvLocal();
const vercelApi = await loadVercelProductionEnvViaApi();
for (const [k, v] of Object.entries(vercelApi)) {
  if (v && !process.env[k]) process.env[k] = v;
}

function pickToken(...candidates) {
  for (const raw of candidates) {
    const token = (raw || "").trim();
    // Real Supabase personal tokens are sbp_… and longer than a stub.
    if (token.startsWith("sbp_") && token.length >= 50) return token;
    if (token.startsWith("eyJ") && token.length >= 100) return token;
  }
  return "";
}

const token = pickToken(
  process.env.SUPABASE_ACCESS_TOKEN,
  local.SUPABASE_ACCESS_TOKEN,
  vercelApi.SUPABASE_ACCESS_TOKEN,
  loadSupabaseAccessToken()
);
const dbUrl = (
  process.env.SUPABASE_DB_URL ||
  local.SUPABASE_DB_URL ||
  vercelApi.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  local.DATABASE_URL ||
  vercelApi.DATABASE_URL ||
  ""
).trim();

const ref = projectRefFromUrl(
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
    local.NEXT_PUBLIC_SUPABASE_URL ||
    vercelApi.NEXT_PUBLIC_SUPABASE_URL
);
if (ref !== EXPECTED) throw new Error(`ref mismatch: ${ref}`);

if (!dbUrl && !token) {
  console.error(`
Missing production DB credentials.

Set ONE of:
  1) SUPABASE_ACCESS_TOKEN=sbp_…  (https://supabase.com/dashboard/account/tokens)
  2) SUPABASE_DB_URL=postgresql://… (Project Settings → Database)

Then re-run:
  node scripts/apply-prod-066-legal-consent.mjs
`);
  process.exit(2);
}

const sqlText = readFileSync(resolve(root, "supabase/migrations", MIGRATION), "utf8");
console.log(
  `applying ${MIGRATION} bytes=${sqlText.length} ref=${ref} via=${dbUrl ? "pg" : token ? "api" : "none"}`
);

async function applySql(sql) {
  if (dbUrl) {
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
    return "pg";
  }
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN / SUPABASE_DB_URL missing");
  if (token.length < 20) {
    throw new Error("SUPABASE_ACCESS_TOKEN looks invalid (too short)");
  }
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${res.status}: ${text.slice(0, 800)}`);
  return "api";
}

async function verifyViaPgOrApi() {
  const verifySql = `
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN (
    'terms_accepted_at',
    'terms_version',
    'privacy_accepted_at',
    'privacy_version',
    'licenses_acknowledged_at',
    'licenses_version',
    'adult_confirmed_at',
    'phone_verified_at'
  )
ORDER BY column_name;
`;
  if (dbUrl) {
    const { Client } = await import("pg");
    const client = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    try {
      const cols = await client.query(verifySql);
      const table = await client.query(`
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'legal_acceptances'
) AS legal_acceptances_exists;
`);
      return { cols: cols.rows, table: table.rows };
    } finally {
      await client.end();
    }
  }
  return { via: "api-skip-structured" };
}

const via = await applySql(sqlText);
console.log("migration applied via", via);

const verify = await verifyViaPgOrApi();
console.log("verify", JSON.stringify(verify));

// PostgREST probe via anon (schema cache)
const url = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  local.NEXT_PUBLIC_SUPABASE_URL ||
  vercelApi.NEXT_PUBLIC_SUPABASE_URL ||
  ""
).replace(/\/$/, "");
const anon =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  local.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  vercelApi.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";
if (url && anon) {
  await new Promise((r) => setTimeout(r, 2000));
  const sel = await fetch(
    `${url}/rest/v1/profiles?select=terms_accepted_at,privacy_accepted_at,licenses_acknowledged_at,adult_confirmed_at&limit=0`,
    {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
    }
  );
  console.log("postgrestStatus", sel.status, (await sel.text()).slice(0, 200));
}
