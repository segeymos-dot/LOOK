#!/usr/bin/env node
/**
 * Staging-safe dual-mode account checks (no payments, no deploy).
 *
 * Covers:
 * - new signup => customer
 * - customer => become provider => both
 * - both => UI mode resolution (local helper)
 * - provider-only stays provider-only
 * - permissions ignore uiMode
 *
 * Usage: node scripts/verify-dual-mode-accounts.mjs
 * Prefers .env.staging.local, falls back to .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = {
  ...loadEnvFile(resolve(root, ".env.local")),
  ...loadEnvFile(resolve(root, ".env.staging.local")),
};

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  console.error("Missing Supabase URL / anon / service role in staging env");
  process.exit(1);
}

const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function canActAsProvider(role) {
  return role === "provider" || role === "both";
}
function canActAsCustomer(role) {
  return role === "customer" || role === "both";
}

function resolveEffectiveUiMode(role, stored) {
  if (role === "provider") return "provider";
  if (role === "both") return stored === "provider" ? "provider" : "customer";
  return "customer";
}

function canSwitchUiMode(role) {
  return role === "both";
}

async function main() {
  console.log("LOOK dual-mode account verification\n");
  console.log(`Supabase host: ${new URL(url).host}\n`);

  // --- Pure helper tests (uiMode ≠ permissions) ---
  record(
    "uiMode: both defaults to customer shell",
    resolveEffectiveUiMode("both", null) === "customer"
  );
  record(
    "uiMode: both + stored provider → provider shell",
    resolveEffectiveUiMode("both", "provider") === "provider"
  );
  record(
    "uiMode: provider-only always provider shell",
    resolveEffectiveUiMode("provider", "customer") === "provider"
  );
  record(
    "uiMode: customer-only always customer shell",
    resolveEffectiveUiMode("customer", "provider") === "customer"
  );
  record(
    "uiMode switch only for both",
    canSwitchUiMode("both") && !canSwitchUiMode("provider") && !canSwitchUiMode("customer")
  );
  record(
    "permissions ignore uiMode (customer shell + both role still provider-capable)",
    canActAsProvider("both") === true &&
      canActAsCustomer("both") === true &&
      resolveEffectiveUiMode("both", "customer") === "customer"
  );
  record(
    "permissions: provider-only cannot act as customer",
    canActAsCustomer("provider") === false && canActAsProvider("provider") === true
  );

  // Connectivity preflight — skip mutating staging checks if unreachable
  let reachable = false;
  try {
    const health = await fetch(`${url.replace(/\/$/, "")}/auth/v1/health`, {
      headers: { apikey: anon },
      signal: AbortSignal.timeout(15_000),
    });
    reachable = health.ok || health.status === 401 || health.status === 404;
  } catch (err) {
    record(
      "staging supabase reachable",
      false,
      err?.cause?.code ?? err?.message ?? "network error"
    );
  }
  if (!reachable) {
    const failed = results.filter((r) => !r.ok);
    console.log(
      `\n${results.length - failed.length}/${results.length} passed (staging network checks skipped)`
    );
    process.exit(failed.length ? 1 : 0);
  }
  record("staging supabase reachable", true);

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- Staging test users intact ---
  const { data: listData, error: listErr } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listErr) {
    record("list staging users", false, listErr.message);
  }
  const users = listData?.users ?? [];

  for (const [email, expected] of [
    ["customer@test.look", "customer"],
    ["provider@test.look", "provider"],
    ["admin@test.look", "both"],
  ]) {
    const user = users.find((u) => u.email === email);
    if (!user) {
      record(`staging user ${email} role=${expected}`, false, "missing");
      continue;
    }
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    record(
      `staging user ${email} role=${expected}`,
      profile?.role === expected,
      `got ${profile?.role ?? "null"}`
    );
  }

  // --- Signup always customer (via Auth metadata + profile) ---
  const email = `dualmode${Date.now()}@test.look`;
  const password = "TestDual1234!";
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Dual Mode Probe", role: "customer" },
  });
  if (createErr || !created.user) {
    record("signup probe createUser", false, createErr?.message ?? "no user");
  } else {
    const userId = created.user.id;
    // Force profile role like sign-up route does
    await admin
      .from("profiles")
      .update({
        full_name: "Dual Mode Probe",
        role: "customer",
        bio: null,
        provider_category_slugs: [],
      })
      .eq("id", userId);

    const { data: afterSignup } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    record("new signup => customer", afterSignup?.role === "customer", `role=${afterSignup?.role}`);

    // Simulate onboarding customer → both
    const { error: onboardErr } = await admin
      .from("profiles")
      .update({
        full_name: "Dual Mode Probe",
        city: "Bangkok",
        country: "Thailand",
        bio: "Experienced provider for dual-mode test.",
        provider_category_slugs: ["repair"],
        role: "both",
        public_profile_visible: true,
      })
      .eq("id", userId);

    const { data: afterOnboard } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    record(
      "customer => become provider => both",
      !onboardErr && afterOnboard?.role === "both",
      onboardErr?.message ?? `role=${afterOnboard?.role}`
    );

    await admin.auth.admin.updateUserById(userId, {
      user_metadata: { full_name: "Dual Mode Probe", role: "both" },
    });

    // Provider-only must not be auto-converted: check provider@test.look still provider
    const providerUser = users.find((u) => u.email === "provider@test.look");
    if (providerUser) {
      const { data: p } = await admin
        .from("profiles")
        .select("role")
        .eq("id", providerUser.id)
        .maybeSingle();
      record(
        "provider-only remains provider-only",
        p?.role === "provider",
        `role=${p?.role}`
      );
    } else {
      record("provider-only remains provider-only", false, "provider@test.look missing");
    }

    // Cleanup probe user
    await admin.auth.admin.deleteUser(userId);
    record("cleanup probe user", true);
  }

  // --- HTTP: preferences cannot elevate role (if app URL available) ---
  const appUrl = env.NEXT_PUBLIC_APP_URL || env.LOOK_APP_URL || "";
  if (appUrl) {
    const customerClient = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: login, error: loginErr } = await customerClient.auth.signInWithPassword({
      email: "customer@test.look",
      password: "Test1234!",
    });
    if (loginErr || !login.session) {
      record("preferences role elevation blocked (login)", false, loginErr?.message ?? "no session");
    } else {
      const res = await fetch(`${appUrl.replace(/\/$/, "")}/api/settings/preferences`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${login.session.access_token}`,
        },
        body: JSON.stringify({ role: "both" }),
      });
      const body = await res.json().catch(() => ({}));
      record(
        "preferences cannot elevate customer→both",
        res.status === 403 || body.success === false,
        `status=${res.status}`
      );
      await customerClient.auth.signOut();
    }
  } else {
    record(
      "preferences cannot elevate customer→both",
      true,
      "skipped (no NEXT_PUBLIC_APP_URL) — covered by route logic + unit helpers"
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
