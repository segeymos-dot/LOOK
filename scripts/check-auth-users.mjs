/**
 * Dev-only: list recent users and auth email confirmation state.
 * Usage: node scripts/check-auth-users.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");

function loadEnv() {
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !service) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false } });
const { data, error } = await admin.auth.admin.listUsers({ perPage: 20 });

if (error) {
  console.error("listUsers error:", error.message);
  process.exit(1);
}

console.log(`Recent users (${data.users.length} shown):\n`);
for (const u of data.users) {
  const domain = u.email?.split("@")[1] ?? "?";
  console.log(
    `${u.email?.slice(0, 45).padEnd(45)} confirmed=${u.email_confirmed_at ? "yes" : "NO "} domain=${domain}`
  );
}

const unconfirmed = data.users.filter((u) => !u.email_confirmed_at);
console.log(`\nUnconfirmed: ${unconfirmed.length}/${data.users.length}`);
