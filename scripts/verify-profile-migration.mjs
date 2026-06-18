#!/usr/bin/env node
/**
 * Verify migration 010_profile_extended_fields.sql and test profile CRUD.
 * Requires NEXT_PUBLIC_SUPABASE_* in .env.local.
 * For apply: SUPABASE_DB_URL (or DATABASE_URL).
 * Optional: SUPABASE_SERVICE_ROLE_KEY for admin user creation.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");

function loadEnv() {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const TEST_PROVIDER_EMAIL =
  process.env.NEXT_PUBLIC_TEST_PROVIDER_EMAIL ?? "provider-extended@test.look";
const TEST_PROVIDER_PASSWORD =
  process.env.NEXT_PUBLIC_TEST_PROVIDER_PASSWORD ?? "Test1234!";
const TEST_PROVIDER_NAME = "Test Provider Extended";

const EXTENDED_FIELDS = {
  phone: "+7 999 111-22-33",
  skills: "Ремонт, электрика, сантехника",
  portfolio: "https://portfolio.test.look/provider-extended",
  provider_category_slugs: ["repair", "design"],
};

async function checkColumnsExist(url, anonKey) {
  const res = await fetch(
    `${url}/rest/v1/profiles?select=id,phone,skills,portfolio,provider_category_slugs&limit=1`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
  );
  const body = await res.json();
  if (res.status === 400 && body?.code === "42703") {
    return { applied: false, error: body.message };
  }
  if (!res.ok) {
    return { applied: false, error: body?.message ?? res.statusText };
  }
  return { applied: true };
}

async function applyMigration() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    return { ok: false, reason: "SUPABASE_DB_URL not configured" };
  }
  const sql = readFileSync(
    resolve(root, "supabase/migrations/010_profile_extended_fields.sql"),
    "utf8"
  );
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    await client.query(sql);
    return { ok: true };
  } finally {
    await client.end();
  }
}

async function ensureProviderUser(url, anonKey, serviceKey) {
  const admin = serviceKey
    ? createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

  const client = createClient(url, anonKey);

  if (admin) {
    const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = listData.users.find((u) => u.email === TEST_PROVIDER_EMAIL);
    if (existing) {
      await admin.auth.admin.updateUserById(existing.id, {
        password: TEST_PROVIDER_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: TEST_PROVIDER_NAME, role: "provider" },
      });
      await admin.from("profiles").upsert({
        id: existing.id,
        full_name: TEST_PROVIDER_NAME,
        role: "provider",
      });
      return { userId: existing.id, created: false };
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_PROVIDER_EMAIL,
      password: TEST_PROVIDER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: TEST_PROVIDER_NAME, role: "provider" },
    });
    if (error) throw new Error(`admin createUser: ${error.message}`);
    return { userId: data.user.id, created: true };
  }

  const { data: signInData, error: signInError } =
    await client.auth.signInWithPassword({
      email: TEST_PROVIDER_EMAIL,
      password: TEST_PROVIDER_PASSWORD,
    });

  if (signInData?.user) {
    return { userId: signInData.user.id, created: false };
  }

  const { data: signUpData, error: signUpError } = await client.auth.signUp({
    email: TEST_PROVIDER_EMAIL,
    password: TEST_PROVIDER_PASSWORD,
    options: {
      data: { full_name: TEST_PROVIDER_NAME, role: "provider" },
    },
  });

  if (signUpError) {
    throw new Error(
      `signUp failed (${signInError?.message ?? "no session"}): ${signUpError.message}`
    );
  }

  if (!signUpData.session) {
    const retry = await client.auth.signInWithPassword({
      email: TEST_PROVIDER_EMAIL,
      password: TEST_PROVIDER_PASSWORD,
    });
    if (retry.error || !retry.data.user) {
      throw new Error(
        "User created but no session. Confirm email in Supabase Auth or set SUPABASE_SERVICE_ROLE_KEY."
      );
    }
    return { userId: retry.data.user.id, created: true };
  }

  return { userId: signUpData.user.id, created: true };
}

async function writeAndReadProfile(url, anonKey, userId) {
  const client = createClient(url, anonKey);
  const login = await client.auth.signInWithPassword({
    email: TEST_PROVIDER_EMAIL,
    password: TEST_PROVIDER_PASSWORD,
  });
  if (login.error || !login.data.session) {
    throw new Error(`login failed: ${login.error?.message}`);
  }

  const payload = {
    full_name: TEST_PROVIDER_NAME,
    role: "provider",
    ...EXTENDED_FIELDS,
  };

  const { data: updated, error: updateError } = await client
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select("id,full_name,role,phone,skills,portfolio,provider_category_slugs")
    .single();

  if (updateError) {
    return { writeOk: false, readOk: false, updateError: updateError.message };
  }

  const { data: readBack, error: readError } = await client
    .from("profiles")
    .select("id,full_name,role,phone,skills,portfolio,provider_category_slugs")
    .eq("id", userId)
    .single();

  if (readError) {
    return {
      writeOk: true,
      readOk: false,
      updated,
      readError: readError.message,
    };
  }

  const matches =
    readBack.phone === EXTENDED_FIELDS.phone &&
    readBack.skills === EXTENDED_FIELDS.skills &&
    readBack.portfolio === EXTENDED_FIELDS.portfolio &&
    Array.isArray(readBack.provider_category_slugs) &&
    readBack.provider_category_slugs.length === 2 &&
    readBack.provider_category_slugs.includes("repair") &&
    readBack.provider_category_slugs.includes("design");

  return { writeOk: true, readOk: true, updated, readBack, matches };
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const report = {
    migration010: { appliedBefore: null, appliedAfter: null, applyAttempt: null },
    testProvider: null,
    crud: null,
  };

  console.log("=== 1. Check migration 010 ===");
  const before = await checkColumnsExist(url, anonKey);
  report.migration010.appliedBefore = before.applied;
  console.log(
    before.applied
      ? "OK: extended profile columns exist"
      : `NOT APPLIED: ${before.error}`
  );

  if (!before.applied) {
    console.log("\n=== 2. Apply migration 010 ===");
    const applyResult = await applyMigration();
    report.migration010.applyAttempt = applyResult;
    if (!applyResult.ok) {
      console.log(`SKIP: ${applyResult.reason}`);
      console.log(
        "Add SUPABASE_DB_URL to .env.local, then rerun:\n" +
          "  node scripts/verify-profile-migration.mjs"
      );
      console.log("\nOr paste in Supabase SQL Editor:");
      console.log(readFileSync(
        resolve(root, "supabase/migrations/010_profile_extended_fields.sql"),
        "utf8"
      ));
      console.log(JSON.stringify(report, null, 2));
      process.exit(2);
    }
    console.log("OK: migration applied");

    const after = await checkColumnsExist(url, anonKey);
    report.migration010.appliedAfter = after.applied;
    if (!after.applied) {
      console.error("FAIL: columns still missing after apply");
      process.exit(1);
    }
  } else {
    report.migration010.appliedAfter = true;
  }

  console.log("\n=== 3. Ensure test provider ===");
  const provider = await ensureProviderUser(url, anonKey, serviceKey || undefined);
  report.testProvider = {
    email: TEST_PROVIDER_EMAIL,
    userId: provider.userId,
    created: provider.created,
  };
  console.log(
    `${provider.created ? "Created" : "Found"} ${TEST_PROVIDER_EMAIL} (${provider.userId})`
  );

  console.log("\n=== 4. Write & read extended fields ===");
  const crud = await writeAndReadProfile(url, anonKey, provider.userId);
  report.crud = crud;

  if (!crud.writeOk) {
    console.error(`WRITE FAIL: ${crud.updateError}`);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  console.log("WRITE OK:", crud.updated);

  if (!crud.readOk) {
    console.error(`READ FAIL: ${crud.readError}`);
    process.exit(1);
  }
  console.log("READ OK:", crud.readBack);

  if (!crud.matches) {
    console.error("FAIL: read values do not match written payload");
    process.exit(1);
  }
  console.log("MATCH OK: all extended fields persisted correctly");

  console.log("\n=== REPORT ===");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
