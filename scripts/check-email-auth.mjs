/**
 * Dev-only: inspect Supabase sign-up / email confirmation behavior.
 * Usage: node scripts/check-email-auth.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq);
      let value = trimmed.slice(eq + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* ignore */
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

if (!url || !anon) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY in .env.local");
  process.exit(1);
}

const client = createClient(url, anon);
const admin = service ? createClient(url, service, { auth: { persistSession: false } }) : null;

const testEmail = `look-email-check-${Date.now()}@test.look`;
const redirectTo = `${appUrl.replace(/\/$/, "")}/auth/callback?next=/`;

console.log("APP_URL:", appUrl);
console.log("emailRedirectTo:", redirectTo);

const { data, error } = await client.auth.signUp({
  email: testEmail,
  password: "Test1234!",
  options: {
    emailRedirectTo: redirectTo,
    data: { full_name: "Email Check", role: "customer" },
  },
});

if (error) {
  console.log("signUp ERROR:", error.message, "status:", error.status);
  process.exit(1);
}

console.log("signUp OK");
console.log("session returned:", data.session ? "yes" : "no");
console.log("user.email_confirmed_at:", data.user?.email_confirmed_at ?? "null");

if (admin && data.user?.id) {
  const { data: adminUser } = await admin.auth.admin.getUserById(data.user.id);
  console.log("admin email_confirmed_at:", adminUser.user.email_confirmed_at ?? "null");
  await admin.auth.admin.deleteUser(data.user.id);
  console.log("test user cleaned up");
}

console.log(
  "\nInterpretation:",
  data.session
    ? "Email confirmation OFF or auto-confirmed — user can log in immediately."
    : "Email confirmation ON — Supabase should send confirmation email (if SMTP/rate limits allow)."
);
