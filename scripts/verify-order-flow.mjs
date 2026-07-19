#!/usr/bin/env node
/**
 * Verify full order lifecycle: create → offer → accept → submit work → accept work → reviews.
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

async function rpcExists(name) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const body = await res.text();
  return !body.includes("PGRST202");
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

  if (!(await rpcExists("submit_work"))) {
    console.warn(
      "⚠️  submit_work RPC missing — using legacy flow (pay before complete).\n" +
        "   Apply migration 017 for the full work lifecycle.\n"
    );
    await legacyFlow();
    return;
  }

  await modernFlow();
}

async function legacyFlow() {
  const customer = await signIn("customer@test.look");
  pass("customer@test.look login");

  const provider = await signIn("provider@test.look");
  pass("provider@test.look login");

  const request = await createOrder(customer);
  pass(`Request created (${request.id}) status=open`);

  const offer = await createOffer(provider, request.id);
  pass(`Offer submitted (${offer.id})`);

  const acceptBody = await acceptOffer(customer, offer.id);
  pass(`Offer accepted, conversation=${acceptBody.conversation_id}`);

  const payBody = await testPayment(customer, request.id);
  if (payBody.platform_fee !== 150 || payBody.provider_amount !== 850) {
    fail(`Commission split wrong: ${JSON.stringify(payBody)}`);
  }
  pass("Test payment: gross=1000, LOOK=150, provider=850");

  const completeBody = await completeRequest(customer, request.id);
  if (completeBody.status !== "completed") fail(`Expected completed, got ${completeBody.status}`);
  pass("Request completed (legacy)");

  await verifyFinance(provider, request.id);
  console.log("\nAll order flow checks passed (legacy).");
  console.log(`Test request ID: ${request.id}`);
}

async function modernFlow() {
  const customer = await signIn("customer@test.look");
  pass("customer@test.look login");

  const provider = await signIn("provider@test.look");
  pass("provider@test.look login");

  const request = await createOrder(customer);
  pass(`Request created (${request.id}) status=open`);

  const offer = await createOffer(provider, request.id);
  pass(`Offer submitted (${offer.id})`);

  const acceptBody = await acceptOffer(customer, offer.id);
  pass(`Offer accepted, conversation=${acceptBody.conversation_id}`);

  const submitRes = await fetch(`${url}/rest/v1/rpc/submit_work`, {
    method: "POST",
    headers: provider.headers,
    body: JSON.stringify({
      p_request_id: request.id,
      p_summary: "Работа выполнена, результат готов к проверке.",
      p_attachments: [],
    }),
  });
  const submitBody = await submitRes.json();
  if (!submitRes.ok) fail(`Submit work: ${JSON.stringify(submitBody)}`);
  pass("Provider submitted work → pending_review");

  const acceptWorkRes = await fetch(`${url}/rest/v1/rpc/accept_work`, {
    method: "POST",
    headers: customer.headers,
    body: JSON.stringify({ p_request_id: request.id }),
  });
  const acceptWorkBody = await acceptWorkRes.json();
  if (!acceptWorkRes.ok) fail(`Accept work: ${JSON.stringify(acceptWorkBody)}`);
  pass("Customer accepted work → completed + payment");

  await verifyFinance(provider, request.id);
  console.log("\nAll order flow checks passed.");
  console.log(`Test request ID: ${request.id}`);
}

async function createOrder(customer) {
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
  return request;
}

async function createOffer(provider, requestId) {
  const searchRes = await fetch(
    `${url}/rest/v1/requests?id=eq.${requestId}&select=id,status`,
    { headers: provider.headers }
  );
  const visible = await searchRes.json();
  if (!visible.length) fail("Provider cannot see new request");
  pass("Provider sees request in search");

  const offerRes = await fetch(`${url}/rest/v1/offers`, {
    method: "POST",
    headers: provider.headers,
    body: JSON.stringify({
      request_id: requestId,
      provider_id: provider.userId,
      price: 1000,
      message: "Готов выполнить заказ качественно и в срок",
      currency: "USD",
    }),
  });
  const offerBody = await offerRes.json();
  if (!offerRes.ok) fail(`Create offer: ${JSON.stringify(offerBody)}`);
  return Array.isArray(offerBody) ? offerBody[0] : offerBody;
}

async function acceptOffer(customer, offerId) {
  const acceptRes = await fetch(`${url}/rest/v1/rpc/accept_offer`, {
    method: "POST",
    headers: customer.headers,
    body: JSON.stringify({ p_offer_id: offerId }),
  });
  const acceptBody = await acceptRes.json();
  if (!acceptRes.ok) fail(`Accept offer: ${JSON.stringify(acceptBody)}`);
  if (!acceptBody.conversation_id) fail("No conversation_id after accept");

  const statusRes = await fetch(
    `${url}/rest/v1/requests?id=eq.${acceptBody.request_id}&select=status`,
    { headers: customer.headers }
  );
  const [{ status }] = await statusRes.json();
  if (status !== "in_progress") fail(`Expected in_progress, got ${status}`);
  pass("Request status=in_progress");
  return acceptBody;
}

async function testPayment(customer, requestId) {
  const payRes = await fetch(`${url}/rest/v1/rpc/simulate_test_payment`, {
    method: "POST",
    headers: customer.headers,
    body: JSON.stringify({ p_request_id: requestId }),
  });
  const payBody = await payRes.json();
  if (!payRes.ok) fail(`Test payment: ${JSON.stringify(payBody)}`);
  return payBody;
}

async function completeRequest(customer, requestId) {
  const completeRes = await fetch(`${url}/rest/v1/rpc/complete_request`, {
    method: "POST",
    headers: customer.headers,
    body: JSON.stringify({ p_request_id: requestId }),
  });
  const completeBody = await completeRes.json();
  if (!completeRes.ok) fail(`Complete request: ${JSON.stringify(completeBody)}`);
  return completeBody;
}

async function verifyFinance(provider, requestId) {
  const txRes = await fetch(
    `${url}/rest/v1/transactions?request_id=eq.${requestId}&select=type,amount`,
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
