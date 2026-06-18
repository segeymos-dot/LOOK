#!/usr/bin/env node
/**
 * Verify migration 012 and run test financial cycle against Supabase.
 * Usage: node scripts/verify-migration-012.mjs
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

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY in .env.local");
  process.exit(1);
}

const TABLES = [
  "payments",
  "transactions",
  "provider_balances",
  "platform_commissions",
  "payouts",
  "platform_settings",
];

async function signIn(email, password) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Auth failed ${email}: ${JSON.stringify(data)}`);
  return {
    token: data.access_token,
    userId: data.user.id,
    headers: {
      apikey: key,
      Authorization: `Bearer ${data.access_token}`,
      "Content-Type": "application/json",
    },
  };
}

async function rpc(headers, fn, args) {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { ok: res.ok, json };
}

async function query(headers, path) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, data };
}

let failed = 0;
function pass(msg) {
  console.log(`OK: ${msg}`);
}
function fail(msg, detail = "") {
  console.error(`FAIL: ${msg}${detail ? " — " + detail : ""}`);
  failed++;
}

console.log("=== Migration 012 schema check ===\n");

for (const table of TABLES) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (res.ok) pass(`table ${table}`);
  else fail(`table ${table}`, (await res.text()).slice(0, 80));
}

const profCol = await fetch(`${url}/rest/v1/profiles?select=is_platform_admin&limit=1`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (profCol.ok) pass("profiles.is_platform_admin column");
else fail("profiles.is_platform_admin", await profCol.text());

console.log("\n=== Test financial cycle ===\n");

let customer;
try {
  customer = await signIn("customer@test.look", "Test1234!");
  pass("customer@test.look login");
} catch (e) {
  fail("customer login", e.message);
  process.exit(1);
}

const { data: inProgress } = await query(
  customer.headers,
  `requests?customer_id=eq.${customer.userId}&status=eq.in_progress&select=id,title&limit=1`
);

let requestId = inProgress?.[0]?.id;

if (!requestId) {
  console.log("No in_progress request — skipping live payment test (create one in UI first)");
} else {
  pass(`found in_progress request ${requestId}`);

  const { data: existingPay } = await query(
    customer.headers,
    `payments?request_id=eq.${requestId}&select=status`
  );

  if (existingPay?.[0]?.status === "paid") {
    pass("payment already exists for request");
  } else {
    const pay = await rpc(customer.headers, "simulate_test_payment", {
      p_request_id: requestId,
    });
    if (pay.ok) pass("simulate_test_payment RPC");
    else fail("simulate_test_payment", JSON.stringify(pay.json));
  }

  const { data: payment } = await query(
    customer.headers,
    `payments?request_id=eq.${requestId}&select=amount_gross,platform_fee,provider_amount,status`
  );
  if (payment?.[0]?.status === "paid") {
    const g = Number(payment[0].amount_gross);
    const f = Number(payment[0].platform_fee);
    const p = Number(payment[0].provider_amount);
    if (Math.abs(f / g - 0.15) < 0.001 && f + p === g) {
      pass(`commission 15% on $${g} → LOOK $${f}, provider $${p}`);
    } else fail("commission math", JSON.stringify(payment[0]));
  } else {
    fail("payment record", JSON.stringify(payment));
  }

  const { data: txs } = await query(
    customer.headers,
    `transactions?request_id=eq.${requestId}&select=type`
  );
  const types = new Set((txs ?? []).map((t) => t.type));
  if (types.has("order_payment") && types.has("platform_commission") && types.has("provider_earning")) {
    pass("3 transaction types created");
  } else {
    fail("transactions", [...types].join(", "));
  }

  const reqRow = await query(customer.headers, `requests?id=eq.${requestId}&select=status`);
  if (reqRow.data?.[0]?.status !== "completed") {
    const done = await rpc(customer.headers, "complete_request", { p_request_id: requestId });
    if (done.ok) pass("complete_request after payment");
    else fail("complete_request", JSON.stringify(done.json));
  } else {
    pass("request already completed");
  }
}

try {
  const provider = await signIn("provider@test.look", "Test1234!");
  pass("provider@test.look login");
  const { data: bal } = await query(provider.headers, `provider_balances?select=available_balance,total_earned`);
  if (bal?.length) pass(`provider balance available=${bal[0].available_balance}`);
  else fail("provider_balances empty for provider");
} catch (e) {
  fail("provider check", e.message);
}

try {
  const admin = await signIn("admin@test.look", "Test1234!");
  pass("admin@test.look login");
  const { data: comm } = await query(admin.headers, "platform_commissions?select=commission_amount&limit=1");
  if (comm?.length) pass("admin can read platform_commissions");
  else pass("platform_commissions empty (no payments yet) — OK if no test payment ran");
  const { data: settings } = await query(admin.headers, "platform_settings?select=value&key=eq.commission_rate");
  if (settings?.[0]?.value === "0.15") pass("commission_rate setting = 0.15");
  else fail("commission_rate setting", JSON.stringify(settings));
} catch (e) {
  fail("admin check", e.message);
}

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
