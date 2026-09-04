#!/usr/bin/env node
/**
 * Apply 065_profile_first_last_name.sql to production LOOK.
 * Refuses staging.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadEnvLocal,
  loadSupabaseAccessToken,
  projectRefFromUrl,
} from "./supabase-credentials.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = "qdiyorwbtffknsstmxju";
const MIGRATION = "065_profile_first_last_name.sql";

const local = loadEnvLocal();
const token = (local.SUPABASE_ACCESS_TOKEN || loadSupabaseAccessToken() || "").trim();
if (!token) throw new Error("SUPABASE_ACCESS_TOKEN missing");
const ref = projectRefFromUrl(local.NEXT_PUBLIC_SUPABASE_URL);
if (ref !== EXPECTED) throw new Error(`ref mismatch: ${ref}`);

const sqlText = readFileSync(resolve(root, "supabase/migrations", MIGRATION), "utf8");
console.log(`applying ${MIGRATION} bytes=${sqlText.length}`);

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
console.log("OK", text.slice(0, 200));

const verify = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN ('full_name', 'first_name', 'last_name')
ORDER BY column_name;
`,
    }),
  }
);
console.log("verify", verify.status, await verify.text());
