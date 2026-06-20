#!/usr/bin/env node
/**
 * Verify full order lifecycle: create → offer → accept → pay → complete.
 * Usage: node scripts/verify-order-flow.mjs
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

function pass(msg) {
  console.log(`✅ ${msg}`);
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

async function signIn(email) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test1234!" }),
  });
  const data = await res.json();
  if (!data.access_token) fail(`Auth failed for ${email}: ${JSON.stringify(data)}`);
  return {
    token: data.access_token,
    userId: data.user.id,
    headers: {
      apikey: key,
      Authorization: `Bearer ${data.access_token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  };
}

async function main() {
  console.log("LOOK order flow verification\n");

  const customer = await signIn("customer@test.look");
  pass("customer@test.look login");

  const provider = await signIn("provider@test.look");
  pass("provider@test.look login");

  const catsRes = await fetch(`${url}/rest/v1/categories?select=id&limit=1`, {
    headers: customer.headers,
  });
  const [category] = await catsRes.json();
  if (!category?.id) fail("No categories in database");

  const title = `Verify flow ${Date.now()}`;
  const createRes = await fetch(`${url}/rest/v1/requests`, {
    method: "POST",
    headers: customer.headers,
    body: JSON.stringify({
      customer_id: customer.userId,
      title,
      description: "Автоматическая проверка полного сценария MVP LOOK",
      category_id: category.id,
      budget_min: 1000,
      budget_max: 1000,
      currency: "USD",
      location: "Dubai",
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) fail(`Create request: ${JSON.stringify(created)}`);
  const request = Array.isArray(created) ? created[0] : created;
  if (request.status !== "open") fail(`Expected status open, got ${request.status}`);
  pass(`Request created (${request.id}) status=open`);

  const searchRes = await fetch(
    `${url}/rest/v1/requests?id=eq.${request.id}&select=id,status`,
    { headers: provider.headers }
  );
  const visible = await searchRes.json();
  if (!visible.length) fail("Provider cannot see new request");
  pass("Provider sees request in search");

  const offerRes = await fetch(`${url}/rest/v1/offers`, {
    method: "POST",
    headers: provider.headers,
    body: JSON.stringify({
      request_id: request.id,
      provider_id: provider.userId,
      price: 1000,
      message: "Готов выполнить заказ качественно и в срок",
      currency: "USD",
    }),
  });
  const offerBody = await offerRes.json();
  if (!offerRes.ok) fail(`Create offer: ${JSON.stringify(offerBody)}`);
  const offer = Array.isArray(offerBody) ? offerBody[0] : offerBody;
  pass(`Offer submitted (${offer.id})`);

  const acceptRes = await fetch(`${url}/rest/v1/rpc/accept_offer`, {
    method: "POST",
    headers: customer.headers,
    body: JSON.stringify({ p_offer_id: offer.id }),
  });
  const acceptBody = await acceptRes.json();
  if (!acceptRes.ok) fail(`Accept offer: ${JSON.stringify(acceptBody)}`);
  if (!acceptBody.conversation_id) fail("No conversation_id after accept");
  pass(`Offer accepted, conversation=${acceptBody.conversation_id}`);

  const statusRes = await fetch(
    `${url}/rest/v1/requests?id=eq.${request.id}&select=status`,
    { headers: customer.headers }
  );
  const [{ status }] = await statusRes.json();
  if (status !== "in_progress") fail(`Expected in_progress, got ${status}`);
  pass("Request status=in_progress");

  const payRes = await fetch(`${url}/rest/v1/rpc/simulate_test_payment`, {
    method: "POST",
    headers: customer.headers,
    body: JSON.stringify({ p_request_id: request.id }),
  });
  const payBody = await payRes.json();
  if (!payRes.ok) fail(`Test payment: ${JSON.stringify(payBody)}`);
  if (payBody.platform_fee !== 150 || payBody.provider_amount !== 850) {
    fail(`Commission split wrong: ${JSON.stringify(payBody)}`);
  }
  pass("Test payment: gross=1000, LOOK=150, provider=850");

  const completeRes = await fetch(`${url}/rest/v1/rpc/complete_request`, {
    method: "POST",
    headers: customer.headers,
    body: JSON.stringify({ p_request_id: request.id }),
  });
  const completeBody = await completeRes.json();
  if (!completeRes.ok) fail(`Complete request: ${JSON.stringify(completeBody)}`);
  if (completeBody.status !== "completed") fail(`Expected completed, got ${completeBody.status}`);
  pass("Request completed");

  const txRes = await fetch(
    `${url}/rest/v1/transactions?request_id=eq.${request.id}&select=type,amount`,
    { headers: provider.headers }
  );
  const txs = await txRes.json();
  if (txs.length < 3) fail(`Expected 3+ transactions, got ${txs.length}`);
  pass(`Transactions recorded (${txs.length} rows for provider view)`);

  const balRes = await fetch(
    `${url}/rest/v1/provider_balances?provider_id=eq.${provider.userId}&select=available_balance`,
    { headers: provider.headers }
  );
  const [balance] = await balRes.json();
  if (!balance?.available_balance) fail("Provider balance missing");
  pass(`Provider balance updated (${balance.available_balance} USD)`);

  const admin = await signIn("admin@test.look");
  const commRes = await fetch(`${url}/rest/v1/platform_commissions?select=commission_amount`, {
    headers: admin.headers,
  });
  const commissions = await commRes.json();
  if (!Array.isArray(commissions) || commissions.length === 0) {
    fail("Admin cannot read platform commissions");
  }
  pass("Admin platform commissions visible");

  console.log("\nAll order flow checks passed.");
  console.log(`Test request ID: ${request.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
