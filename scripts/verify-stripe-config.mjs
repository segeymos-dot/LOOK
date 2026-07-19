#!/usr/bin/env node
/**
 * Reports which Stripe / payment env vars are present (never prints secret values).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(name) {
  const path = resolve(root, name);
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[t.slice(0, i).trim()] = v;
  }
  return env;
}

const env = { ...loadEnvFile(".env"), ...loadEnvFile(".env.local"), ...process.env };

const required = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

console.log("Stripe / payment env check\n");
const missing = [];
for (const key of required) {
  const value = String(env[key] ?? "").trim();
  const ok = Boolean(value);
  if (!ok) missing.push(key);
  const hint = ok
    ? key.includes("KEY") || key.includes("SECRET")
      ? `set (${value.startsWith("sk_test") || value.startsWith("pk_test") || value.startsWith("whsec_") || value.startsWith("sk_live") || value.startsWith("pk_live") ? value.slice(0, 7) + "…" : "len=" + value.length})`
      : "set"
    : "MISSING";
  console.log(`${ok ? "✅" : "❌"} ${key}: ${hint}`);
}

console.log("");
if (missing.length) {
  console.log("Add these to .env.local (do not invent values):");
  for (const key of missing) console.log(`  - ${key}`);
  console.log("");
  console.log("After keys are set:");
  console.log("  1. Apply migrations: npm run supabase:apply-pending");
  console.log("  2. Local webhook: stripe listen --forward-to localhost:3000/api/webhooks/stripe");
  console.log("  3. Put the CLI whsec_… into STRIPE_WEBHOOK_SECRET");
  console.log("  4. Pay with test card 4242 4242 4242 4242");
  process.exit(1);
}

console.log("All required payment env vars are present.");
