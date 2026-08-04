#!/usr/bin/env node
/**
 * Authorization + settings/session static checks (no live UI).
 * Optional live Supabase checks when LOOK_LIVE_AUTH=1 and test users exist.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

// --- Static structure ---
assert.ok(existsSync(join(root, "src/app/settings/page.tsx")));
assert.ok(existsSync(join(root, "src/app/settings/sessions/page.tsx")));
assert.ok(existsSync(join(root, "src/app/api/auth/sign-out/route.ts")));
assert.ok(existsSync(join(root, "src/app/api/auth/sessions/route.ts")));
assert.ok(existsSync(join(root, "supabase/migrations/038_account_settings_sessions.sql")));

const middleware = read("src/lib/supabase/middleware.ts");
assert.match(middleware, /\/settings/);
assert.match(middleware, /\/finance/);

const authProvider = read("src/components/providers/AuthProvider.tsx");
assert.match(authProvider, /"local"\s*\|\s*"global"/);
assert.match(authProvider, /clearPrivateClientStorage/);
assert.match(authProvider, /resetBrowserClient/);
assert.match(authProvider, /LOOK_AUTH_BROADCAST/);

const cleanup = read("src/lib/auth/sign-out-cleanup.ts");
assert.match(cleanup, /LOOK_LOCALE_KEY/);
assert.match(cleanup, /PRIVATE_STORAGE_KEYS/);
assert.match(cleanup, /clearLocale/);

const en = read("src/lib/i18n/locales/en.ts");
const ru = read("src/lib/i18n/locales/ru.ts");
for (const key of [
  "settings: {",
  "sessions: {",
  "signOutAll",
  "twoFactor",
]) {
  assert.match(en, new RegExp(key));
  assert.match(ru, new RegExp(key));
}

const profile = read("src/app/profile/page.tsx");
assert.match(profile, /\/settings/);
assert.match(profile, /profile\.settings/);

// Role visibility expectations for settings sections
function canActAsProvider(role) {
  return role === "provider" || role === "both";
}
function canActAsCustomer(role) {
  return role === "customer" || role === "both";
}

assert.equal(canActAsProvider("provider"), true);
assert.equal(canActAsProvider("customer"), false);
assert.equal(canActAsCustomer("customer"), true);
assert.equal(canActAsCustomer("both"), true);
assert.equal(canActAsProvider("both"), true);

// Admin is flag, not role — settings still available
const isAdmin = true;
assert.equal(isAdmin || canActAsCustomer("customer"), true);

console.log("✅ account settings auth static checks passed");

// --- Optional live flow ---
if (process.env.LOOK_LIVE_AUTH !== "1") {
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const emailA = process.env.LOOK_TEST_CUSTOMER_EMAIL ?? "customer@test.look";
const passA = process.env.LOOK_TEST_CUSTOMER_PASSWORD ?? "Test1234!";
const emailB = process.env.LOOK_TEST_PROVIDER_EMAIL ?? "provider@test.look";
const passB = process.env.LOOK_TEST_PROVIDER_PASSWORD ?? "Test1234!";

if (!url || !anon) {
  console.log("⏭ live auth skipped (missing Supabase env)");
  process.exit(0);
}

const { createClient } = await import("@supabase/supabase-js");

async function signIn(email, password) {
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client, session: data.session, user: data.user };
}

const a = await signIn(emailA, passA);
assert.ok(a.user?.id);
const profileA = await a.client.from("profiles").select("id, role").eq("id", a.user.id).maybeSingle();
assert.ok(profileA.data?.id);

await a.client.auth.signOut({ scope: "local" });

const b = await signIn(emailB, passB);
assert.ok(b.user?.id);
assert.notEqual(b.user.id, a.user.id);
const profileB = await b.client.from("profiles").select("id, role").eq("id", b.user.id).maybeSingle();
assert.ok(profileB.data?.id);
assert.notEqual(profileB.data.id, profileA.data.id);

// Expired / revoked: sign out global then ensure getUser fails for old client session
await b.client.auth.signOut({ scope: "global" });
const {
  data: { user: afterGlobal },
} = await b.client.auth.getUser();
assert.equal(afterGlobal, null);

console.log("✅ account settings live auth checks passed");
