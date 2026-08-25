#!/usr/bin/env node
/**
 * Apply 053_admin_sessions_today_last_seen.sql to production LOOK
 * (qdiyorwbtffknsstmxju). Refuses staging.
 *
 * Usage: node scripts/apply-prod-053-admin-sessions-today.mjs
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
const FORBIDDEN = "iwsybuugiyzimvdrelag";
const MIGRATION = "053_admin_sessions_today_last_seen.sql";

const local = loadEnvLocal();
const token = (local.SUPABASE_ACCESS_TOKEN || loadSupabaseAccessToken() || "").trim();
if (!token) throw new Error("SUPABASE_ACCESS_TOKEN missing");
const ref = projectRefFromUrl(local.NEXT_PUBLIC_SUPABASE_URL);
if (ref !== EXPECTED) throw new Error(`ref mismatch: ${ref}`);
if (ref === FORBIDDEN) throw new Error("refuses staging");

const sqlText = readFileSync(resolve(root, "supabase/migrations", MIGRATION), "utf8");
console.log(`applying ${MIGRATION} bytes=${sqlText.length} ref=${ref}`);

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
console.log("OK", text.slice(0, 120));
