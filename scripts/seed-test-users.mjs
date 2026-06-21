#!/usr/bin/env node
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

const accounts = [
  {
    email: "customer@test.look",
    password: "Test1234!",
    fullName: "Test Customer",
    role: "customer",
    isPlatformAdmin: false,
  },
  {
    email: "provider@test.look",
    password: "Test1234!",
    fullName: "Extended Test Provider",
    role: "provider",
    isPlatformAdmin: false,
  },
  {
    email: "admin@test.look",
    password: "Test1234!",
    fullName: "LOOK Admin",
    role: "both",
    isPlatformAdmin: true,
  },
];

async function seedWithServiceRole() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });

  for (const account of accounts) {
    const existing = listData.users.find((u) => u.email === account.email);

    if (existing) {
      await admin.auth.admin.updateUserById(existing.id, {
        password: account.password,
        email_confirm: true,
        user_metadata: {
          full_name: account.fullName,
          role: account.role,
        },
      });
      await admin
        .from("profiles")
        .upsert({
          id: existing.id,
          full_name: account.fullName,
          role: account.role,
          is_platform_admin: Boolean(account.isPlatformAdmin),
        });
      console.log(`updated ${account.email}`);
      continue;
    }

    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: {
        full_name: account.fullName,
        role: account.role,
      },
    });

    if (error) {
      console.error(`failed ${account.email}: ${error.message}`);
    } else {
      console.log(`created ${account.email} (${data.user?.id})`);
    }
  }

  return true;
}

async function seedWithDatabase() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) return false;

  const seedSql = readFileSync(
    resolve(root, "supabase/migrations/005_seed_test_users.sql"),
    "utf8"
  );
  const fixSql = readFileSync(
    resolve(root, "supabase/migrations/006_fix_seeded_auth_users.sql"),
    "utf8"
  );
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query(seedSql);
    console.log("Applied 005_seed_test_users.sql");
    await client.query(fixSql);
    console.log("Applied 006_fix_seeded_auth_users.sql");
  } finally {
    await client.end();
  }

  return true;
}

async function verifyLogin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;

  for (const account of accounts) {
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: account.email,
        password: account.password,
      }),
    });
    const body = await res.json();
    if (body.access_token) {
      console.log(`login ok: ${account.email}`);
    } else {
      console.error(`login failed: ${account.email} -> ${body.msg || body.error_description}`);
    }
  }
}

loadEnv();

if (await seedWithServiceRole()) {
  await verifyLogin();
  process.exit(0);
}

if (await seedWithDatabase()) {
  await verifyLogin();
  process.exit(0);
}

console.error(
  "Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_DB_URL in .env.local, then rerun:\n" +
    "  node scripts/seed-test-users.mjs"
);
process.exit(1);
