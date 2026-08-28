#!/usr/bin/env node
/**
 * Apply 054_create_admin_support_ticket.sql to production LOOK.
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
const MIGRATION = "054_create_admin_support_ticket.sql";

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
console.log("OK");

// Cleanup double-submit test noise only
const cleanup = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
DELETE FROM public.admin_support_messages WHERE subject = 'DUP TEST';
SELECT COUNT(*)::int AS tickets FROM public.admin_support_messages;
SELECT left(id::text,8) AS id_prefix, subject, user_role, status
FROM public.admin_support_messages
ORDER BY created_at DESC;
`,
    }),
  }
);
console.log("cleanup", cleanup.status, await cleanup.text());
