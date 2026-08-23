#!/usr/bin/env node
/**
 * Seed LOOK Staging test accounts only (.env.staging.local).
 * Never touches .env.local / production. Never prints secrets or passwords.
 *
 * Usage: node scripts/seed-staging-test-users.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stagingEnvPath = resolve(root, ".env.staging.local");
const localEnvPath = resolve(root, ".env.local");

/** Known local test passwords — never logged. */
const TEST_PASSWORD = "Test1234!";

const ACCOUNTS = [
  {
    email: "customer@test.look",
    fullName: "Staging Customer",
    role: "customer",
    label: "customer",
    isPlatformAdmin: false,
  },
  {
    email: "provider@test.look",
    fullName: "Staging Provider",
    role: "provider",
    label: "provider",
    isPlatformAdmin: false,
  },
  {
    email: "admin@test.look",
    fullName: "Staging Admin",
    role: "both",
    label: "admin",
    isPlatformAdmin: true,
  },
];

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = value;
  }
  return out;
}

function projectRefFromUrl(url) {
  return new URL(url).hostname.split(".")[0];
}

function redact(msg) {
  return String(msg)
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[redacted-jwt]")
    .replace(/sb_[a-z]+_[A-Za-z0-9]+/g, "[redacted-key]")
    .replace(/postgres(?:ql)?:\/\/[^\s)'"]+/gi, "[redacted-db-url]");
}

function assertStagingOnly(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const service = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const projectId = env.SUPABASE_PROJECT_ID?.trim();

  if (!url || !anon || !service || !projectId) {
    throw new Error(
      "Missing staging keys in .env.staging.local (URL, anon, service_role, project_id)"
    );
  }

  const ref = projectRefFromUrl(url);
  if (ref !== projectId) {
    throw new Error("Staging URL ref does not match SUPABASE_PROJECT_ID");
  }

  const local = loadEnvFile(localEnvPath);
  if (local.NEXT_PUBLIC_SUPABASE_URL?.trim() === url) {
    throw new Error(
      "Staging URL equals .env.local — refusing (would seed local/production)"
    );
  }

  // Hard-deny known production host naming if present in APP URL (not required)
  if (url.includes("lookcruise")) {
    throw new Error("Refusing URL that looks like production");
  }

  return { url, anon, service, projectId, ref };
}

async function ensureUser(admin, account) {
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listError) {
    throw new Error(`listUsers failed: ${listError.message}`);
  }

  const existing = (listed?.users ?? []).find(
    (u) => (u.email || "").toLowerCase() === account.email.toLowerCase()
  );

  let userId;
  let action;

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: account.fullName,
        role: account.role,
      },
    });
    if (error) throw new Error(`updateUser ${account.email}: ${error.message}`);
    userId = existing.id;
    action = "updated";
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: account.fullName,
        role: account.role,
      },
    });
    if (error) throw new Error(`createUser ${account.email}: ${error.message}`);
    userId = data.user.id;
    action = "created";
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      full_name: account.fullName,
      role: account.role,
      is_platform_admin: Boolean(account.isPlatformAdmin),
    },
    { onConflict: "id" }
  );
  if (profileError) {
    throw new Error(`profile upsert ${account.email}: ${profileError.message}`);
  }

  const { data: profile, error: readError } = await admin
    .from("profiles")
    .select("id, role, is_platform_admin")
    .eq("id", userId)
    .maybeSingle();
  if (readError || !profile) {
    throw new Error(`profile read ${account.email}: ${readError?.message || "missing"}`);
  }

  return { userId, action, profile };
}

async function verifyLogin(url, anon, account) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anon,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: account.email,
      password: TEST_PASSWORD,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const msg = body.error_description || body.msg || body.error || res.status;
    return { ok: false, detail: String(msg) };
  }
  return { ok: true };
}

async function main() {
  console.log("LOOK Staging — seed test accounts (Admin API)");
  console.log("Target: .env.staging.local only · no Production · no Stripe");

  if (!existsSync(stagingEnvPath)) {
    throw new Error("Missing .env.staging.local");
  }

  const env = loadEnvFile(stagingEnvPath);
  const { url, anon, service, ref } = assertStagingOnly(env);
  console.log("OK: staging project ref verified (not printed)");
  console.log("OK: staging URL differs from .env.local");
  void ref;
  void service; // used below; never logged

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rows = [];

  for (const account of ACCOUNTS) {
    try {
      const { action, profile } = await ensureUser(admin, account);
      const login = await verifyLogin(url, anon, account);
      const roleLabel = account.isPlatformAdmin
        ? `${profile.role}+admin`
        : profile.role;
      const pass =
        login.ok &&
        profile.role === account.role &&
        Boolean(profile.is_platform_admin) === Boolean(account.isPlatformAdmin);
      rows.push({
        email: account.email,
        role: roleLabel,
        seed: action,
        login: login.ok ? "PASS" : "FAIL",
        overall: pass ? "PASS" : "FAIL",
        detail: login.ok ? "" : redact(login.detail || ""),
      });
    } catch (e) {
      rows.push({
        email: account.email,
        role: account.label,
        seed: "error",
        login: "FAIL",
        overall: "FAIL",
        detail: redact(e instanceof Error ? e.message : String(e)),
      });
    }
  }

  console.log("");
  console.log("email | role | seed | login | result");
  console.log("----------------------------------------");
  for (const r of rows) {
    console.log(
      `${r.email} | ${r.role} | ${r.seed} | ${r.login} | ${r.overall}${
        r.detail ? ` (${r.detail})` : ""
      }`
    );
  }

  const allPass = rows.every((r) => r.overall === "PASS");
  console.log("");
  console.log(allPass ? "SEED_VERIFY: PASS" : "SEED_VERIFY: FAIL");
  console.log("Passwords and service role key were not printed.");
  console.log("No push / no deploy.");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(redact(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
