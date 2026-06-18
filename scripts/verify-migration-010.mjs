#!/usr/bin/env node
/**
 * Check, apply, and verify migration 010 (extended profile fields).
 *
 * Usage:
 *   node scripts/verify-migration-010.mjs
 *   node scripts/verify-migration-010.mjs --apply
 *   node scripts/verify-migration-010.mjs --apply --seed-provider
 *
 * Requires SUPABASE_DB_URL (preferred) or SUPABASE_SERVICE_ROLE_KEY + public URL/key in .env.local
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");
const MIGRATION = "supabase/migrations/010_profile_extended_fields.sql";

const EXTENDED_COLS = ["phone", "skills", "portfolio", "provider_category_slugs"];

const TEST_PROVIDER = {
  email: "provider@test.look",
  password: "Test1234!",
  fullName: "Extended Test Provider",
  role: "provider",
  profile: {
    phone: "+7 999 111-22-33",
    skills: "React, TypeScript, UI/UX",
    portfolio: "https://portfolio.example.com/extended-provider",
    provider_category_slugs: ["it", "design"],
    city: "Москва",
    country: "Россия",
    bio: "Тестовый исполнитель для проверки migration 010",
  },
};

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

async function checkColumnsViaRest() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY");

  const res = await fetch(
    `${url}/rest/v1/profiles?select=${EXTENDED_COLS.join(",")}&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  const body = await res.text();
  if (res.ok) {
    return { applied: true, method: "rest", detail: "All extended columns queryable" };
  }
  if (body.includes("does not exist")) {
    return { applied: false, method: "rest", detail: JSON.parse(body).message };
  }
  throw new Error(`Unexpected REST response (${res.status}): ${body}`);
}

async function checkColumnsViaPg(client) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'profiles'
       AND column_name = ANY($1::text[])`,
    [EXTENDED_COLS]
  );
  const found = rows.map((r) => r.column_name).sort();
  return {
    applied: found.length === EXTENDED_COLS.length,
    found,
    missing: EXTENDED_COLS.filter((c) => !found.includes(c)),
  };
}

async function applyMigration(client) {
  const sql = readFileSync(resolve(root, MIGRATION), "utf8");
  await client.query(sql);
}

async function getPgClient() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) return null;
  const { Client } = await import("pg");
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

async function seedProviderViaAnon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(url, key);

  let userId;

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: TEST_PROVIDER.email,
    password: TEST_PROVIDER.password,
  });

  if (signInData.user) {
    userId = signInData.user.id;
    console.log(`Signed in existing user: ${TEST_PROVIDER.email}`);
  } else if (signInError?.message?.includes("Invalid login credentials")) {
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: TEST_PROVIDER.email,
      password: TEST_PROVIDER.password,
      options: {
        data: { full_name: TEST_PROVIDER.fullName, role: TEST_PROVIDER.role },
      },
    });
    if (signUpError) throw new Error(`Sign up failed: ${signUpError.message}`);
    userId = signUpData.user?.id;
    if (!userId) throw new Error("Sign up succeeded but no user id (check email confirmation settings)");
    console.log(`Created user via signUp: ${TEST_PROVIDER.email} (${userId})`);
  } else if (signInError) {
    throw new Error(`Sign in failed: ${signInError.message}`);
  }

  if (!userId) throw new Error("No user id");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: TEST_PROVIDER.fullName,
      role: TEST_PROVIDER.role,
      ...TEST_PROVIDER.profile,
    })
    .eq("id", userId)
    .select(
      "id, full_name, role, phone, skills, portfolio, provider_category_slugs, city, country, bio"
    )
    .single();

  if (profileError) throw new Error(`Profile update failed: ${profileError.message}`);

  await supabase.auth.signOut();
  return { userId, profile };
}

async function seedProvider() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return seedProviderViaAdmin();
  }
  console.log("(Using anon auth — no service role key)");
  return seedProviderViaAnon();
}

async function seedProviderViaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let userId = listData?.users?.find((u) => u.email === TEST_PROVIDER.email)?.id;

  if (userId) {
    await admin.auth.admin.updateUserById(userId, {
      password: TEST_PROVIDER.password,
      email_confirm: true,
      user_metadata: {
        full_name: TEST_PROVIDER.fullName,
        role: TEST_PROVIDER.role,
      },
    });
    console.log(`Updated auth user: ${TEST_PROVIDER.email}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_PROVIDER.email,
      password: TEST_PROVIDER.password,
      email_confirm: true,
      user_metadata: {
        full_name: TEST_PROVIDER.fullName,
        role: TEST_PROVIDER.role,
      },
    });
    if (error) throw new Error(`Create user failed: ${error.message}`);
    userId = data.user?.id;
    console.log(`Created auth user: ${TEST_PROVIDER.email} (${userId})`);
  }

  if (!userId) throw new Error("No user id after seed");

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: TEST_PROVIDER.fullName,
      role: TEST_PROVIDER.role,
      ...TEST_PROVIDER.profile,
    })
    .eq("id", userId)
    .select(
      "id, full_name, role, phone, skills, portfolio, provider_category_slugs, city, country, bio"
    )
    .single();

  if (profileError) throw new Error(`Profile update failed: ${profileError.message}`);

  return { userId, profile };
}

async function readProfileViaAnon(userId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const res = await fetch(
    `${url}/rest/v1/profiles?id=eq.${userId}&select=id,full_name,role,phone,skills,portfolio,provider_category_slugs,city,country,bio`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data[0] ?? null;
}

function assertProfile(profile) {
  const expected = TEST_PROVIDER.profile;
  const errors = [];
  for (const field of EXTENDED_COLS) {
    const actual = profile[field];
    const exp = expected[field];
    if (field === "provider_category_slugs") {
      const a = Array.isArray(actual) ? [...actual].sort() : actual;
      const e = [...exp].sort();
      if (JSON.stringify(a) !== JSON.stringify(e)) {
        errors.push(`${field}: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
      }
    } else if (actual !== exp) {
      errors.push(`${field}: expected "${exp}", got "${actual}"`);
    }
  }
  return errors;
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const shouldSeedProvider = process.argv.includes("--seed-provider");

  console.log("=== Migration 010 verification ===\n");

  const restCheck = await checkColumnsViaRest();
  console.log("REST column check:", restCheck.applied ? "APPLIED" : "NOT APPLIED");
  if (!restCheck.applied) console.log("  →", restCheck.detail);

  let pgClient = null;
  try {
    pgClient = await getPgClient();
  } catch (e) {
    console.log("\nPG connection:", e.message);
  }

  if (pgClient) {
    const pgCheck = await checkColumnsViaPg(pgClient);
    console.log("\nPG column check:", pgCheck.applied ? "APPLIED" : "NOT APPLIED");
    if (!pgCheck.applied) {
      console.log("  Found:", pgCheck.found.join(", ") || "(none)");
      console.log("  Missing:", pgCheck.missing.join(", "));
    }

    if (apply && !pgCheck.applied) {
      console.log("\nApplying migration via PG...");
      await applyMigration(pgClient);
      const after = await checkColumnsViaPg(pgClient);
      console.log("After apply:", after.applied ? "OK" : "FAILED");
      if (!after.applied) process.exit(1);
    }
  } else if (apply && !restCheck.applied) {
    console.error(
      "\nCannot apply migration: set SUPABASE_DB_URL in .env.local\n" +
        "Supabase → Project Settings → Database → Connection string (URI)"
    );
    process.exit(1);
  }

  if (pgClient) await pgClient.end();

  if (shouldSeedProvider) {
    if (!restCheck.applied && !apply) {
      const recheck = await checkColumnsViaRest();
      if (!recheck.applied) {
        console.error("\nCannot seed provider: migration 010 not applied");
        process.exit(1);
      }
    }

    console.log("\nSeeding test provider with extended fields...");
    const { userId, profile } = await seedProvider();
    console.log("Write result:", JSON.stringify(profile, null, 2));

    const readBack = await readProfileViaAnon(userId);
    console.log("\nRead via REST:", JSON.stringify(readBack, null, 2));

    const errors = assertProfile(readBack ?? profile);
    if (errors.length) {
      console.error("\nVerification FAILED:");
      errors.forEach((e) => console.error("  -", e));
      process.exit(1);
    }
    console.log("\nVerification PASSED: all extended fields match");
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
