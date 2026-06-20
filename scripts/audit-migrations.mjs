#!/usr/bin/env node
/**
 * Audit which supabase/migrations/*.sql appear applied in the linked database.
 * Uses REST + RPC probes (no direct DB required).
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
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

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY in .env.local");
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function restOk(table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers });
  return res.ok;
}

async function rpcExists(name, args = {}) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (res.ok) return { applied: true, detail: "OK" };
  if (res.status === 404 || text.includes("PGRST202") || text.includes("Could not find the function")) {
    return { applied: false, detail: "function missing" };
  }
  // Business-logic errors (e.g. P0001 unauthorized) mean the function exists.
  return { applied: true, detail: `exists (${res.status})` };
}

async function signIn(email, password) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return data.access_token ? data : null;
}

/** Probes per migration file (heuristic — not a migration tracking table). */
const PROBES = {
  "001_initial_schema.sql": async () => {
    const tables = ["profiles", "categories", "requests", "offers", "conversations", "messages"];
    const results = await Promise.all(tables.map((t) => restOk(t)));
    return results.every(Boolean) ? "applied" : "missing";
  },
  "002_accept_reject_offer.sql": async () => {
    const r = await rpcExists("accept_offer", { p_offer_id: "00000000-0000-0000-0000-000000000001" });
    return r.applied ? "applied" : "missing";
  },
  "003_fix_auth_signup_trigger.sql": async () => {
    const auth = await signIn("customer@test.look", "Test1234!");
    if (!auth?.user?.id) return "unknown (test user login failed)";
    const res = await fetch(`${url}/rest/v1/profiles?id=eq.${auth.user.id}&select=id,full_name&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${auth.access_token}` },
    });
    return res.ok ? "applied" : "unknown";
  },
  "004_auto_confirm_email.sql": async () => {
    return PROBES["003_fix_auth_signup_trigger.sql"]();
  },
  "005_seed_test_users.sql": async () => {
    const users = ["customer@test.look", "provider@test.look", "admin@test.look"];
    const ok = await Promise.all(
      users.map(async (email) => {
        const a = await signIn(email, "Test1234!");
        return Boolean(a?.access_token);
      })
    );
    return ok.every(Boolean) ? "applied" : "partial/missing";
  },
  "006_fix_seeded_auth_users.sql": async () => PROBES["005_seed_test_users.sql"](),
  "007_fix_offers_select_rls.sql": async () => {
    const auth = await signIn("provider@test.look", "Test1234!");
    if (!auth) return "unknown";
    const res = await fetch(`${url}/rest/v1/offers?select=*&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${auth.access_token}` },
    });
    return res.ok ? "applied" : "missing";
  },
  "008_deploy_offer_rpc.sql": async () => PROBES["002_accept_reject_offer.sql"](),
  "009_request_lifecycle_rpc.sql": async () => {
    const cancel = await rpcExists("cancel_request", {
      p_request_id: "00000000-0000-0000-0000-000000000001",
    });
    const complete = await rpcExists("complete_request", {
      p_request_id: "00000000-0000-0000-0000-000000000001",
    });
    if (cancel.applied && complete.applied) return "applied";
    if (complete.applied && !cancel.applied) {
      return "partial (complete_request exists via 012, cancel_request missing)";
    }
    return "missing";
  },
  "010_profile_extended_fields.sql": async () => {
    const res = await fetch(`${url}/rest/v1/profiles?select=phone,skills,portfolio,provider_category_slugs&limit=1`, {
      headers,
    });
    return res.ok ? "applied" : "missing";
  },
  "011_provider_profile_enhancements.sql": async () => {
    const table = await restOk("reviews");
    const fn = await rpcExists("refresh_provider_rating", {
      p_provider_id: "00000000-0000-0000-0000-000000000001",
    });
    return table && fn.applied ? "applied" : "missing";
  },
  "012_financial_core.sql": async () => {
    const tables = [
      "payments",
      "transactions",
      "provider_balances",
      "platform_commissions",
      "platform_settings",
    ];
    const ok = await Promise.all(tables.map((t) => restOk(t)));
    const pay = await rpcExists("simulate_test_payment", {
      p_request_id: "00000000-0000-0000-0000-000000000001",
    });
    const complete = await rpcExists("complete_request", {
      p_request_id: "00000000-0000-0000-0000-000000000001",
    });
    return ok.every(Boolean) && pay.applied && complete.applied ? "applied" : "missing";
  },
  "013_message_read.sql": async () => {
    const col = await fetch(`${url}/rest/v1/messages?select=read_at&limit=1`, { headers });
    const fn = await rpcExists("mark_conversation_read", {
      p_conversation_id: "00000000-0000-0000-0000-000000000001",
    });
    const colOk = col.ok;
    const fnOk = fn.applied;
    if (colOk && fnOk) return "applied";
    if (colOk && !fnOk) return "partial (read_at column exists, RPC missing)";
    return "missing";
  },
  "014_conversation_inbox.sql": async () => {
    const auth = await signIn("customer@test.look", "Test1234!");
    if (!auth) return "unknown";
    const res = await fetch(`${url}/rest/v1/rpc/get_conversation_inbox`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${auth.access_token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    const text = await res.text();
    if (res.ok) return "applied";
    if (text.includes("Could not find the function")) return "missing";
    return res.ok ? "applied" : "unknown";
  },
};

async function main() {
  const files = readdirSync(resolve(root, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log("Migration audit for:", url.replace(/https:\/\/([^.]+).*/, "https://$1..."));
  console.log("");

  const results = [];
  for (const file of files) {
    const probe = PROBES[file];
    let status = "no probe";
    if (probe) {
      try {
        status = await probe();
      } catch (e) {
        status = `error: ${e.message}`;
      }
    }
    results.push({ file, status });
    const icon = status === "applied" ? "✅" : status.startsWith("partial") ? "⚠️" : status === "missing" ? "❌" : "❓";
    console.log(`${icon} ${file} — ${status}`);
  }

  const missing = results.filter((r) => r.status === "missing" || r.status.startsWith("partial"));
  console.log("");
  if (missing.length === 0) {
    console.log("All probed migrations appear applied.");
  } else {
    console.log("Action required:");
    for (const m of missing) {
      console.log(`  npm run supabase:apply-migration supabase/migrations/${m.file}`);
      console.log(`  — or paste SQL in Supabase SQL Editor`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
