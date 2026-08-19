/**
 * Staging legal-consent smoke checks (signup API + DB verify).
 * Usage: node scripts/verify-legal-consent.mjs
 * Reads .env.staging.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL optional).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const eq = t.indexOf("=");
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}

const env = {
  ...loadEnv(resolve(root, ".env.staging.local")),
  ...process.env,
};

const APP_URL =
  env.STAGING_APP_URL?.trim() ||
  "https://look-git-staging-preview-lookcruise.vercel.app";
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stamp = Date.now();
const email = `legal.consent.${stamp}@example.com`;
const password = `LookTest_${stamp}!`;

async function signup(body) {
  const res = await fetch(`${APP_URL}/api/auth/sign-up`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

console.log("APP", APP_URL);
console.log("1) Signup WITHOUT acceptedTerms…");
const blocked = await signup({
  full_name: "Legal Gate Test",
  email,
  password,
  acceptedTerms: false,
});
console.log("  status", blocked.status, "error", blocked.data?.error ?? null);
if (blocked.status < 400) {
  console.error("FAIL: signup without consent should be rejected");
  process.exit(1);
}

console.log("2) Signup WITH acceptedTerms…");
const ok = await signup({
  full_name: "Legal Gate Test",
  email,
  password,
  phone: "",
  country: "TH",
  city: "Bangkok",
  acceptedTerms: true,
});
console.log("  status", ok.status, "success", ok.data?.success, "session", Boolean(ok.data?.session));
if (!ok.data?.success) {
  console.error("FAIL:", ok.data);
  process.exit(1);
}

const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const user = users?.users?.find((u) => u.email === email);
if (!user) {
  console.error("FAIL: user not found via admin API");
  process.exit(1);
}

const { data: profile, error } = await admin
  .from("profiles")
  .select(
    "terms_accepted_at, terms_version, privacy_accepted_at, privacy_version, is_platform_admin, role"
  )
  .eq("id", user.id)
  .maybeSingle();

if (error) {
  console.error("FAIL profile read", error.message);
  process.exit(1);
}

console.log("3) Profile consent:", profile);
const versionOk =
  profile?.terms_version === "2026-08-19" &&
  profile?.privacy_version === "2026-08-19" &&
  Boolean(profile?.terms_accepted_at) &&
  Boolean(profile?.privacy_accepted_at);

if (!versionOk) {
  console.error("FAIL: consent fields incomplete");
  process.exit(1);
}

console.log("PASS: new customer signup stores current legal consent");

// cleanup test user
await admin.auth.admin.deleteUser(user.id);
console.log("cleaned up test user");
