#!/usr/bin/env node
/**
 * Load production env vars from Vercel CLI into process.env (no stdout secrets).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vercelBin = resolve(root, "node_modules", ".bin", "vercel");

function loadEnvLocal() {
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

export function loadProductionEnvFromVercel() {
  loadEnvLocal();
  if (!existsSync(vercelBin)) return;

  for (const name of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
    "SUPABASE_ACCESS_TOKEN",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]) {
    if (process.env[name]) continue;
    const result = spawnSync(vercelBin, ["env", "get", name, "production"], {
      cwd: root,
      encoding: "utf8",
    });
    const value = result.stdout?.trim();
    if (value && !value.includes("Error") && !value.includes("not found")) {
      process.env[name] = value;
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadProductionEnvFromVercel();
  for (const key of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
    "SUPABASE_ACCESS_TOKEN",
  ]) {
    console.log(key, process.env[key] ? `set (${process.env[key].length} chars)` : "missing");
  }
}
