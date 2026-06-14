#!/usr/bin/env node
/**
 * Apply a SQL migration file to the linked Supabase database.
 * Requires SUPABASE_DB_URL in .env.local (Project Settings → Database → Connection string → URI).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");

function loadEnv() {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnv();
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/apply-migration.mjs <path-to-sql>");
    process.exit(1);
  }

  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error(
      "Missing SUPABASE_DB_URL in .env.local.\n" +
        "Add it from Supabase → Project Settings → Database → Connection string (URI)."
    );
    process.exit(1);
  }

  const sql = readFileSync(resolve(root, file), "utf8");
  const { Client } = await import("pg");
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    await client.query(sql);
    console.log(`Applied migration: ${file}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
