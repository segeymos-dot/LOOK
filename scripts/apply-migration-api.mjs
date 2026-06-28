#!/usr/bin/env node
/**
 * Apply SQL migration via Supabase Management API.
 * Requires SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)
 * and NEXT_PUBLIC_SUPABASE_URL in .env.local or environment.
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
    console.error("Usage: node scripts/apply-migration-api.mjs <path-to-sql>");
    process.exit(1);
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!token) {
    console.error("Missing SUPABASE_ACCESS_TOKEN");
    process.exit(1);
  }
  if (!supabaseUrl) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL");
    process.exit(1);
  }

  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const sql = readFileSync(resolve(root, file), "utf8");

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  const body = await res.text();
  if (!res.ok) {
    console.error(`Supabase API error (${res.status}):`, body);
    process.exit(1);
  }

  console.log(`Applied migration via API: ${file}`);
  if (body && body !== "[]") console.log(body);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
