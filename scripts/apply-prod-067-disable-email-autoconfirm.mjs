#!/usr/bin/env node
/**
 * Apply 067_disable_handle_new_user_email_autoconfirm.sql to production LOOK.
 * Refuses non-production project ref. Does not print secrets.
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
const MIGRATION = "067_disable_handle_new_user_email_autoconfirm.sql";

loadProductionEnvFromVercel();
const local = loadEnvLocal();
const vercelApi = await loadVercelProductionEnvViaApi();
for (const [k, v] of Object.entries(vercelApi)) {
  if (v && !process.env[k]) process.env[k] = v;
}

function pickToken(...candidates) {
  for (const raw of candidates) {
    const token = (raw || "").trim();
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

Paste supabase/migrations/${MIGRATION} into:
  https://supabase.com/dashboard/project/${EXPECTED}/sql/new

Or set SUPABASE_ACCESS_TOKEN / SUPABASE_DB_URL and re-run.
`);
  process.exit(2);
}

const sqlText = readFileSync(resolve(root, "supabase/migrations", MIGRATION), "utf8");
console.log(`applying ${MIGRATION} bytes=${sqlText.length} ref=${ref}`);

if (dbUrl) {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sqlText);
    const check = await client.query(`
SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure) AS def
`);
    const def = check.rows?.[0]?.def ?? "";
    console.log(
      "autoConfirmStillPresent",
      /email_confirmed_at\s*=/.test(def)
    );
  } finally {
    await client.end();
  }
} else {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sqlText }),
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${res.status}: ${text.slice(0, 800)}`);
  console.log("migration applied via api");

  const verify = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure) AS def`,
      }),
    }
  );
  const verifyText = await verify.text();
  console.log(
    "autoConfirmStillPresent",
    /email_confirmed_at\s*=/.test(verifyText)
  );
}

console.log("OK");
