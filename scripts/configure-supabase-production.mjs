#!/usr/bin/env node
/**
 * Configure Supabase Auth URLs for production (Vercel + lookcruise.com).
 *
 * Requires SUPABASE_ACCESS_TOKEN from https://supabase.com/dashboard/account/tokens
 * Reads NEXT_PUBLIC_SUPABASE_URL from .env.local or environment.
 *
 * Usage:
 *   npm run deploy:supabase-auth
 *   npm run deploy:supabase-auth -- --url https://look-xxxxx.vercel.app
 *   npm run deploy:supabase-auth -- --domain lookcruise.com
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

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

function parseArgs() {
  const args = process.argv.slice(2);
  let url = null;
  let domain = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && args[i + 1]) url = args[++i];
    if (args[i] === "--domain" && args[i + 1]) domain = args[++i];
  }
  return { url, domain };
}

const localEnv = loadEnvLocal();
const { url: urlArg, domain: domainArg } = parseArgs();

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const accessToken =
  process.env.SUPABASE_ACCESS_TOKEN || localEnv.SUPABASE_ACCESS_TOKEN;

if (!supabaseUrl) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

const productionOrigin = domainArg
  ? `https://${domainArg.replace(/^https?:\/\//, "").replace(/\/$/, "")}`
  : urlArg?.replace(/\/$/, "") || "https://lookcruise.com";

const redirectUrls = [
  `${productionOrigin}/**`,
  "https://lookcruise.com/**",
  "https://www.lookcruise.com/**",
  `${productionOrigin}/auth/callback`,
  `${productionOrigin}/auth/callback?next=/reset-password`,
  "https://lookcruise.com/auth/callback",
  "https://lookcruise.com/auth/callback?next=/reset-password",
  "https://www.lookcruise.com/auth/callback",
  "http://localhost:3000/auth/callback",
  "http://127.0.0.1:3010/auth/callback",
];

const uniqueRedirects = [...new Set(redirectUrls)];
const siteUrl = domainArg
  ? `https://${domainArg.replace(/^https?:\/\//, "").replace(/\/$/, "")}`
  : productionOrigin;

const payload = {
  site_url: siteUrl,
  uri_allow_list: uniqueRedirects.join(","),
};

console.log("Supabase project:", projectRef);
console.log("Site URL:", payload.site_url);
console.log("Redirect URLs:\n", uniqueRedirects.map((u) => `  - ${u}`).join("\n"));

if (!accessToken) {
  console.log(`
No SUPABASE_ACCESS_TOKEN set. Add these manually in Supabase Dashboard:
  Authentication → URL Configuration

  Site URL: ${payload.site_url}

  Redirect URLs (one per line):
${uniqueRedirects.map((u) => `    ${u}`).join("\n")}

Create a token at https://supabase.com/dashboard/account/tokens
then rerun: SUPABASE_ACCESS_TOKEN=... npm run deploy:supabase-auth
`);
  process.exit(0);
}

const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }
);

if (!res.ok) {
  const body = await res.text();
  console.error(`Supabase API error (${res.status}):`, body);
  process.exit(1);
}

console.log("\nSupabase auth URLs updated successfully.");
