#!/usr/bin/env node
/**
 * Staging-only admin support E2E with mandatory cleanup.
 *
 * - Creates tickets with subject prefix "E2E "
 * - Always deletes them in finally (even on failure)
 * - Refuses production Supabase project
 *
 * Requires:
 *   .env.staging.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   SUPABASE_DB_URL (for cleanup), and seeded test users.
 *
 * Usage:
 *   node scripts/verify-admin-support-e2e.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const PRODUCTION_PROJECT_REF = "qdiyorwbtffknsstmxju";
const TEST_PASSWORD = "Test1234!";

function loadEnvFile(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing env file: ${path}`);
  }
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    let value = t.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = value;
  }
  return out;
}

function projectRefFromUrl(url) {
  return new URL(url).hostname.split(".")[0];
}

async function login(url, anon, email, password) {
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw new Error(`login failed ${email}: ${error?.message ?? "no session"}`);
  }
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function cleanupTickets(dbUrl, subjects) {
  if (!subjects.length) return;
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(
      `delete from public.admin_support_messages
       where subject = any($1::text[])`,
      [subjects]
    );
  } finally {
    await client.end();
  }
}

async function runRoleFlow({
  url,
  anon,
  role,
  email,
  adminEmail,
  stamp,
}) {
  const user = await login(url, anon, email, TEST_PASSWORD);
  const {
    data: { user: authUser },
  } = await user.auth.getUser();
  if (!authUser) throw new Error(`${role}: missing auth user`);

  const subject = `E2E ${role} ${stamp}`;
  const { data: ticket, error: tErr } = await user
    .from("admin_support_messages")
    .insert({
      user_id: authUser.id,
      user_role: role,
      subject,
      message: `${role} hello admin`,
      language: "ru",
      status: "new",
      last_activity_at: new Date().toISOString(),
      user_last_read_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (tErr) throw new Error(`${role} ticket: ${tErr.message}`);

  const { error: mErr } = await user.from("admin_support_thread_messages").insert({
    ticket_id: ticket.id,
    sender_type: "user",
    sender_user_id: authUser.id,
    message: `${role} hello admin`,
    language: "ru",
  });
  if (mErr) throw new Error(`${role} thread: ${mErr.message}`);

  const admin = await login(url, anon, adminEmail, TEST_PASSWORD);
  const {
    data: { user: adminUser },
  } = await admin.auth.getUser();
  if (!adminUser) throw new Error("admin missing");

  const { error: arErr } = await admin.from("admin_support_thread_messages").insert({
    ticket_id: ticket.id,
    sender_type: "admin",
    sender_user_id: adminUser.id,
    message: `Admin answer to ${role}`,
    language: "ru",
  });
  if (arErr) throw new Error(`${role} admin reply: ${arErr.message}`);

  await admin
    .from("admin_support_messages")
    .update({
      status: "answered",
      admin_last_read_at: new Date().toISOString(),
    })
    .eq("id", ticket.id);

  const { data: thread } = await user
    .from("admin_support_thread_messages")
    .select("sender_type")
    .eq("ticket_id", ticket.id);
  if (!(thread ?? []).some((m) => m.sender_type === "admin")) {
    throw new Error(`${role}: user cannot see admin reply`);
  }

  return subject;
}

async function main() {
  const envPath = resolve(process.cwd(), ".env.staging.local");
  const env = loadEnvFile(envPath);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const dbUrl = env.SUPABASE_DB_URL;
  if (!url || !anon || !dbUrl) {
    throw new Error("Need NEXT_PUBLIC_SUPABASE_URL, ANON key, SUPABASE_DB_URL in .env.staging.local");
  }

  const ref = projectRefFromUrl(url);
  if (ref === PRODUCTION_PROJECT_REF) {
    throw new Error(
      `Refusing admin-support E2E against production project ${PRODUCTION_PROJECT_REF}`
    );
  }

  const stamp = Date.now();
  const createdSubjects = [];
  try {
    createdSubjects.push(
      await runRoleFlow({
        url,
        anon,
        role: "customer",
        email: "customer@test.look",
        adminEmail: "admin@test.look",
        stamp,
      })
    );
    createdSubjects.push(
      await runRoleFlow({
        url,
        anon,
        role: "provider",
        email: "provider@test.look",
        adminEmail: "admin@test.look",
        stamp: stamp + 1,
      })
    );
    console.log("verify-admin-support-e2e: OK");
  } finally {
    await cleanupTickets(dbUrl, createdSubjects);
    console.log(
      `cleanup: removed ${createdSubjects.length} E2E subject(s)`,
      createdSubjects
    );
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
