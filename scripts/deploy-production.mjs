#!/usr/bin/env node
/**
 * Deploy LOOK to Vercel production.
 *
 * Prerequisites:
 *   - vercel CLI (npm run deploy uses the devDependency)
 *   - `vercel login` or VERCEL_TOKEN in the environment
 *   - .env.local with Supabase keys (or set env vars in Vercel dashboard)
 *
 * Usage:
 *   npm run deploy
 *   npm run deploy -- --domain lookcruise.com
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const vercelBin = path.join(root, "node_modules", ".bin", "vercel");

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: opts.silent ? "pipe" : "inherit",
    env: { ...process.env, ...opts.env },
    input: opts.input,
  });
  if (result.status !== 0 && !opts.allowFailure) {
    process.exit(result.status ?? 1);
  }
  return result;
}

function isLocalAppUrl(value) {
  if (!value) return false;
  return (
    value.includes("localhost") ||
    value.includes("127.0.0.1") ||
    value.includes(":3010")
  );
}

function syncVercelEnv(name, value, { overwriteLocalAppUrl = false } = {}) {
  if (!value) return;
  const existing = run(vercelBin, ["env", "get", name, "production"], {
    silent: true,
    allowFailure: true,
  });
  const current = existing.stdout?.toString().trim();
  const hasValue =
    current && !current.includes("Error") && !current.includes("not found");

  if (
    hasValue &&
    overwriteLocalAppUrl &&
    name === "NEXT_PUBLIC_APP_URL" &&
    isLocalAppUrl(current) &&
    !isLocalAppUrl(value)
  ) {
    run(vercelBin, ["env", "rm", name, "production", "--yes"], {
      allowFailure: true,
      silent: true,
    });
  } else if (hasValue) {
    return;
  }

  run(
    vercelBin,
    ["env", "add", name, "production", "--value", value, "--yes"],
    { allowFailure: true }
  );
}

const args = process.argv.slice(2);
const PRODUCTION_APP_URL = "https://lookcruise.com";

const localEnv = loadEnvLocal();
const customDomain = args.includes("--domain")
  ? args[args.indexOf("--domain") + 1]
  : null;

const fromEnv =
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  localEnv.NEXT_PUBLIC_APP_URL?.trim();
const productionAppUrl = customDomain
  ? `https://${customDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`
  : fromEnv && !isLocalAppUrl(fromEnv)
    ? fromEnv.replace(/\/$/, "")
    : PRODUCTION_APP_URL;

const envToSync = {
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY || localEnv.SUPABASE_SERVICE_ROLE_KEY,
};

if (productionAppUrl) {
  envToSync.NEXT_PUBLIC_APP_URL = productionAppUrl.replace(/\/$/, "");
}

console.log("Deploying LOOK to Vercel production...\n");

if (!fs.existsSync(vercelBin)) {
  console.error("Vercel CLI not found. Run: npm install");
  process.exit(1);
}

for (const [name, value] of Object.entries(envToSync)) {
  if (value) {
    syncVercelEnv(name, value, {
      overwriteLocalAppUrl: name === "NEXT_PUBLIC_APP_URL",
    });
  }
}

const deployArgs = ["deploy", "--prod", "--yes"];
for (const [name, value] of Object.entries(envToSync)) {
  if (value) {
    deployArgs.push("--build-env", `${name}=${value}`);
    deployArgs.push("-e", `${name}=${value}`);
  }
}

run(vercelBin, deployArgs);

if (customDomain) {
  console.log(`\nAdding custom domain ${customDomain}...`);
  run(vercelBin, ["domains", "add", customDomain]);
  run(vercelBin, ["domains", "add", `www.${customDomain}`]);
}

console.log("\nDeployment complete.");
console.log("Next: update Supabase auth URLs — npm run deploy:supabase-auth");
