#!/usr/bin/env node
/**
 * Verify registration auth flow against Supabase.
 * Usage: node scripts/verify-registration.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");

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
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY in .env.local");
  process.exit(1);
}

function pass(msg) {
  console.log(`✅ ${msg}`);
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

async function main() {
  console.log("LOOK registration flow verification\n");

  const email = `betatest${Date.now()}@test.look`;
  const password = "TestBeta123!";

  const signUpRes = await fetch(`${url}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      data: {
        full_name: "Beta Test User",
        role: "customer",
      },
    }),
  });

  const signUpBody = await signUpRes.json();
  if (!signUpRes.ok || !signUpBody.id) {
    fail(`signUp failed: ${JSON.stringify(signUpBody)}`);
  }
  pass(`signUp created user ${signUpBody.id}`);

  if (signUpBody.access_token) {
    pass("Session returned immediately (email confirmation disabled in Supabase)");
  } else {
    pass("No session after signUp (email confirmation required — expected for beta)");
  }

  const loginBeforeConfirm = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await loginBeforeConfirm.json();

  if (signUpBody.access_token) {
    if (!loginBeforeConfirm.ok) fail(`Login failed when confirm disabled: ${JSON.stringify(loginBody)}`);
    pass("Login works after registration");
  } else {
    if (loginBeforeConfirm.ok) {
      console.warn("⚠️  Login succeeded without email confirm — Supabase may have confirm disabled");
    } else {
      pass(`Login blocked before confirm: ${loginBody.error_description ?? loginBody.msg ?? "expected"}`);
    }
  }

  const profileRes = await fetch(
    `${url}/rest/v1/profiles?id=eq.${signUpBody.id}&select=full_name,role`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${signUpBody.access_token ?? key}`,
      },
    }
  );
  const profiles = await profileRes.json();
  if (!profiles[0]?.full_name) {
    fail(`Profile not created: ${JSON.stringify(profiles)}`);
  }
  pass(`Profile created: ${profiles[0].full_name}, role=${profiles[0].role}`);

  const resetRes = await fetch(`${url}/auth/v1/recover`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!resetRes.ok) {
    const resetBody = await resetRes.json();
    fail(`Password recovery request failed: ${JSON.stringify(resetBody)}`);
  }
  pass("Password recovery email request accepted");

  if (serviceKey) {
    const adminRes = await fetch(`${url}/auth/v1/admin/users/${signUpBody.id}`, {
      method: "DELETE",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (adminRes.ok) {
      pass("Test user cleaned up via service role");
    } else {
      console.warn(`⚠️  Could not delete test user ${email}`);
    }
  } else {
    console.warn(`⚠️  SUPABASE_SERVICE_ROLE_KEY not set — test user ${email} not deleted`);
  }

  console.log("\nRegistration flow checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
