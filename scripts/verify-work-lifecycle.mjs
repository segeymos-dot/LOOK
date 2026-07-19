#!/usr/bin/env node
/**
 * Verify order work lifecycle (RPC or chat-message fallback).
 * Usage: node scripts/verify-work-lifecycle.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");

const WORK_SUBMIT_PREFIX = "LOOK:WORK_SUBMIT:";

function parseWorkSubmitMessage(content) {
  if (!content?.startsWith(WORK_SUBMIT_PREFIX)) return null;
  const rest = content.slice(WORK_SUBMIT_PREFIX.length);
  const newlineIndex = rest.indexOf("\n");
  const jsonPart = newlineIndex === -1 ? rest.trim() : rest.slice(0, newlineIndex).trim();
  try {
    return JSON.parse(jsonPart);
  } catch {
    return null;
  }
}

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

async function createOrder(customer) {
  const catsRes = await fetch(`${url}/rest/v1/categories?select=id&limit=1`, {
    headers: customer.headers,
  });
  const [category] = await catsRes.json();
  if (!category?.id) fail("No categories in database");

  const title = `Work lifecycle ${Date.now()}`;
  const createRes = await fetch(`${url}/rest/v1/requests`, {
    method: "POST",
    headers: customer.headers,
    body: JSON.stringify({
      customer_id: customer.userId,
      title,
      description: "Автоматическая проверка жизненного цикла работы LOOK",
      category_id: category.id,
      budget_min: 1000,
      budget_max: 1000,
      currency: "USD",
      location: "Dubai",
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) fail(`Create request: ${JSON.stringify(created)}`);
  return Array.isArray(created) ? created[0] : created;
}

async function submitWorkFallback(provider, requestId, conversationId) {
  const payload = {
    summary: "Работа выполнена согласно ТЗ. Результаты во вложениях.",
    attachments: [{ name: "result.pdf", url: "https://example.com/result.pdf", type: "document" }],
    revision: 1,
  };
  const res = await fetch(`${url}/rest/v1/messages`, {
    method: "POST",
    headers: provider.headers,
    body: JSON.stringify({
      conversation_id: conversationId,
      sender_id: provider.userId,
      content: `${WORK_SUBMIT_PREFIX}${JSON.stringify(payload)}\n\n📋 Работа сдана на проверку заказчику.\n\n${payload.summary}`,
    }),
  });
  const body = await res.json();
  if (!res.ok) fail(`Fallback submit work: ${JSON.stringify(body)}`);
}

async function requestRevisionFallback(customer, conversationId, feedback) {
  const payload = { feedback };
  const res = await fetch(`${url}/rest/v1/messages`, {
    method: "POST",
    headers: customer.headers,
    body: JSON.stringify({
      conversation_id: conversationId,
      sender_id: customer.userId,
      content: `LOOK:WORK_REVISION:${JSON.stringify(payload)}\n\n🔄 ${feedback}`,
    }),
  });
  const body = await res.json();
  if (!res.ok) fail(`Fallback revision: ${JSON.stringify(body)}`);
}

async function main() {
  console.log("LOOK work lifecycle verification\n");

  const hasRpc = await rpcExists("submit_work");
  pass(hasRpc ? "submit_work RPC available" : "using chat-message fallback (migration 017 not applied)");

  const customer = await signIn("customer@test.look");
  pass("customer@test.look login");

  const provider = await signIn("provider@test.look");
  pass("provider@test.look login");

  const request = await createOrder(customer);
  pass(`Request created (${request.id}) status=open`);

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
  const conversationId = acceptBody.conversation_id;
  pass(`Offer accepted, conversation=${conversationId}`);

  if (hasRpc) {
    const submitRes = await fetch(`${url}/rest/v1/rpc/submit_work`, {
      method: "POST",
      headers: provider.headers,
      body: JSON.stringify({
        p_request_id: request.id,
        p_summary: "Работа выполнена согласно ТЗ.",
        p_attachments: [],
      }),
    });
    const submitBody = await submitRes.json();
    if (!submitRes.ok) fail(`Submit work: ${JSON.stringify(submitBody)}`);
    pass("Provider submitted work via RPC");
  } else {
    await submitWorkFallback(provider, request.id, conversationId);
    pass("Provider submitted work via chat fallback");
  }

  // Customer must see pending_review after provider submit
  const msgsRes = await fetch(
    `${url}/rest/v1/messages?conversation_id=eq.${conversationId}&select=content&order=created_at.desc&limit=5`,
    { headers: customer.headers }
  );
  const msgs = await msgsRes.json();
  const submitMsg = msgs.find((m) => m.content?.startsWith(WORK_SUBMIT_PREFIX));
  if (!submitMsg) fail("Customer cannot see work submit message in chat");
  const parsed = parseWorkSubmitMessage(submitMsg.content);
  if (!parsed?.summary) fail("Work submit message payload is not parseable");
  pass("Customer sees parseable work submit message (status → pending_review");

  const dbStatusRes = await fetch(
    `${url}/rest/v1/requests?id=eq.${request.id}&select=status`,
    { headers: customer.headers }
  );
  const [{ status: dbStatus }] = await dbStatusRes.json();
  if (dbStatus !== "in_progress" && dbStatus !== "pending_review") {
    fail(`Unexpected DB status after submit: ${dbStatus}`);
  }
  // Effective status must be pending_review (derived from chat when DB still in_progress)
  let pendingReview = false;
  for (const m of msgs) {
    if (parseWorkSubmitMessage(m.content)) pendingReview = true;
  }
  if (!pendingReview) fail("Effective status is not pending_review for customer");
  pass(`Customer effective status=pending_review (db=${dbStatus})`);

  if (process.argv.includes("--revision")) {
    await requestRevisionFallback(
      customer,
      conversationId,
      "Нужно доработать детали по пункту 2"
    );
    pass("Customer sent work back for revision");

    if (hasRpc) {
      const resubmitRes = await fetch(`${url}/rest/v1/rpc/submit_work`, {
        method: "POST",
        headers: provider.headers,
        body: JSON.stringify({
          p_request_id: request.id,
          p_summary: "Доработки внесены.",
          p_attachments: [],
        }),
      });
      const resubmitBody = await resubmitRes.json();
      if (!resubmitRes.ok) fail(`Resubmit work: ${JSON.stringify(resubmitBody)}`);
    } else {
      await submitWorkFallback(provider, request.id, conversationId);
    }
    pass("Provider resubmitted work");
  }

  if (await rpcExists("accept_work")) {
    const acceptWorkRes = await fetch(`${url}/rest/v1/rpc/accept_work`, {
      method: "POST",
      headers: customer.headers,
      body: JSON.stringify({ p_request_id: request.id }),
    });
    const acceptWorkBody = await acceptWorkRes.json();
    if (!acceptWorkRes.ok) fail(`Accept work RPC: ${JSON.stringify(acceptWorkBody)}`);
    pass("Customer accepted work via accept_work RPC");
  } else {
    const payRes = await fetch(`${url}/rest/v1/rpc/simulate_test_payment`, {
      method: "POST",
      headers: customer.headers,
      body: JSON.stringify({ p_request_id: request.id }),
    });
    const payBody = await payRes.json();
    if (!payRes.ok) fail(`Test payment: ${JSON.stringify(payBody)}`);

    const completeRes = await fetch(`${url}/rest/v1/rpc/complete_request`, {
      method: "POST",
      headers: customer.headers,
      body: JSON.stringify({ p_request_id: request.id }),
    });
    const completeBody = await completeRes.json();
    if (!completeRes.ok) fail(`Complete request: ${JSON.stringify(completeBody)}`);
    pass("Customer accepted work via payment + complete fallback");
  }

  const statusRes = await fetch(
    `${url}/rest/v1/requests?id=eq.${request.id}&select=status`,
    { headers: customer.headers }
  );
  const [{ status }] = await statusRes.json();
  if (status !== "completed") fail(`Expected completed, got ${status}`);
  pass("Request status=completed (moved to history)");

  const reviewRes = await fetch(`${url}/rest/v1/reviews`, {
    method: "POST",
    headers: customer.headers,
    body: JSON.stringify({
      provider_id: provider.userId,
      reviewer_id: customer.userId,
      request_id: request.id,
      rating: 5,
      comment: "Отличная работа, всё выполнено в срок!",
    }),
  });
  const reviewBody = await reviewRes.json();
  if (!reviewRes.ok) fail(`Customer review: ${JSON.stringify(reviewBody)}`);
  pass("Customer left review for provider");

  console.log("\nAll work lifecycle checks passed.");
  console.log(`Test request ID: ${request.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
