#!/usr/bin/env node
/**
 * Print 069 SQL for Supabase SQL Editor (production).
 * Usage: node scripts/print-prod-069-sql.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(
  resolve(root, "supabase/migrations/069_fix_admin_online_role_counts.sql"),
  "utf8"
);
console.log(sql);
console.log("\n-- Paste into https://supabase.com/dashboard/project/qdiyorwbtffknsstmxju/sql/new");
