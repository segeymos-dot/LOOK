#!/usr/bin/env node
/**
 * Live platform-wide refund ledger reconciliation against local/dev Supabase.
 * Creates paid test orders, refunds, retries (idempotency), and opens a dispute.
 *
 * Prefers .env.development.local (local stack). Does not touch Stripe.
 *
 * Usage: node scripts/verify-ledger-refund-flow.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env.development.local", ".env.local", ".env"]) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^"|"$/g, "");
      if (file.includes("development.local") || !(k in env)) env[k] = v;
    }
  }
  return env;
}

function pass(msg) {
  console.log(`✅ ${msg}`);
}
function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

const REQUIRED_REFUND_CODES = [
  "order_payment",
  "provider_earning",
  "platform_commission",
  "customer_refund",
  "provider_earning_reversal",
  "platform_commission_reversal",
];

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !service) {
  console.log("Skipping live ledger checks (missing supabase env)");
  process.exit(0);
}

const host = new URL(url).host;
console.log(`Host: ${host}`);

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Probe ledger helper
{
  const { error } = await admin.rpc("apply_test_refund", {
    p_request_id: "00000000-0000-0000-0000-000000000000",
    p_reason: "probe",
  });
  if (error?.message?.includes("Could not find") || error?.message?.includes("PGRST202")) {
    fail("apply_test_refund missing — apply migration 033/034");
  }
  pass(`apply_test_refund reachable (${error?.message || "ok"})`);
}

async function ensureColumn() {
  const { data, error } = await admin
    .from("transactions")
    .select("id, ledger_code, amount_signed, account_scope, idempotency_key")
    .limit(1);
  if (error) fail(`transactions ledger columns missing: ${error.message}`);
  pass("transactions ledger columns present");
  return data;
}
await ensureColumn();

async function createPaidOrder({ withWork = false } = {}) {
  const stamp = Date.now();
  const customerEmail = `ledger-cust-${stamp}@look.local`;
  const providerEmail = `ledger-prov-${stamp}@look.local`;
  const password = "TestPass123!";

  const cust = await admin.auth.admin.createUser({
    email: customerEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Ledger Customer", role: "customer" },
  });
  if (cust.error) fail(`create customer: ${cust.error.message}`);

  const prov = await admin.auth.admin.createUser({
    email: providerEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Ledger Provider", role: "provider" },
  });
  if (prov.error) fail(`create provider: ${prov.error.message}`);

  const customerId = cust.data.user.id;
  const providerId = prov.data.user.id;

  await admin.from("profiles").upsert([
    {
      id: customerId,
      email: customerEmail,
      full_name: "Ledger Customer",
      role: "customer",
    },
    {
      id: providerId,
      email: providerEmail,
      full_name: "Ledger Provider",
      role: "provider",
    },
  ]);

  const { data: category } = await admin.from("categories").select("id").limit(1).maybeSingle();
  const categoryId = category?.id ?? null;

  const { data: request, error: reqErr } = await admin
    .from("requests")
    .insert({
      customer_id: customerId,
      title: `Ledger refund fixture ${stamp}`,
      description: "Platform-wide ledger verification fixture",
      status: "open",
      currency: "USD",
      category_id: categoryId,
      budget_max: 100,
    })
    .select("id")
    .single();
  if (reqErr) fail(`create request: ${reqErr.message}`);

  const { data: offer, error: offerErr } = await admin
    .from("offers")
    .insert({
      request_id: request.id,
      provider_id: providerId,
      price: 100,
      currency: "USD",
      message: "Fixture offer",
      status: "accepted",
      estimated_days: 3,
    })
    .select("id")
    .single();
  if (offerErr) fail(`create offer: ${offerErr.message}`);

  await admin
    .from("requests")
    .update({ status: "in_progress", order_payment_status: "unpaid" })
    .eq("id", request.id);

  const { data: payData, error: payErr } = await admin.rpc("simulate_test_payment", {
    p_request_id: request.id,
    p_external_reference: `ledger-fixture-${randomUUID()}`,
  });
  if (payErr) fail(`simulate_test_payment: ${payErr.message}`);

  if (withWork) {
    await admin.from("work_submissions").insert({
      request_id: request.id,
      provider_id: providerId,
      summary: "Work submitted for dispute fixture",
      revision_number: 1,
    });
    await admin
      .from("requests")
      .update({
        status: "pending_review",
        work_submitted_at: new Date().toISOString(),
      })
      .eq("id", request.id);
  }

  return {
    requestId: request.id,
    customerId,
    providerId,
    customerEmail,
    password,
    payment: payData,
    offerId: offer.id,
  };
}

async function ledgerCodesForRequest(requestId) {
  const { data: payment } = await admin
    .from("payments")
    .select("id, status, amount_gross, platform_fee, provider_amount")
    .eq("request_id", requestId)
    .maybeSingle();
  const { data: txs } = await admin
    .from("transactions")
    .select("id, type, ledger_code, amount, amount_signed, account_scope, description, status")
    .eq("payment_id", payment.id)
    .eq("status", "completed");
  return { payment, txs: txs || [] };
}

function assertFullRefundLedger(payment, txs) {
  const byCode = Object.fromEntries(
    txs.map((t) => [t.ledger_code || (t.type === "refund" ? "customer_refund" : t.type), t])
  );
  for (const code of REQUIRED_REFUND_CODES) {
    if (!byCode[code]) fail(`missing ledger row ${code} for payment ${payment.id}`);
  }
  // Descriptions must be stable codes, not RU/EN prose
  for (const t of txs) {
    if (/[А-Яа-яЁё]/.test(t.description || "")) {
      fail(`localized description stored: ${t.description}`);
    }
  }
  const gross = Number(payment.amount_gross);
  const fee = Number(payment.platform_fee);
  const earn = Number(payment.provider_amount);
  const refund = byCode.customer_refund;
  const earnRev = byCode.provider_earning_reversal;
  const feeRev = byCode.platform_commission_reversal;
  if (Math.abs(Number(refund.amount) - gross) > 0.001) fail("customer_refund amount mismatch");
  if (Math.abs(Number(earnRev.amount) - earn) > 0.001) fail("earning reversal amount mismatch");
  if (Math.abs(Number(feeRev.amount) - fee) > 0.001) fail("commission reversal amount mismatch");
  // Signs: customer refund +, provider/platform reversals -
  if (Number(refund.amount_signed) < 0) fail("customer_refund amount_signed should be +");
  if (Number(earnRev.amount_signed) > 0) fail("provider_earning_reversal amount_signed should be -");
  if (Number(feeRev.amount_signed) > 0) fail("platform_commission_reversal amount_signed should be -");
  // Reconcile
  if (Math.abs(gross - (earn + fee)) > 0.01) fail("gross != earn + fee");
  pass(`full refund ledger reconciles (gross=${gross})`);
}

// --- Full refund + idempotent retry ---
{
  const order = await createPaidOrder({ withWork: false });
  const first = await admin.rpc("apply_test_refund", {
    p_request_id: order.requestId,
    p_reason: "customer_cancel_before_work_submission",
  });
  if (first.error) fail(`refund #1: ${first.error.message}`);

  const second = await admin.rpc("apply_test_refund", {
    p_request_id: order.requestId,
    p_reason: "customer_cancel_before_work_submission",
  });
  if (second.error) fail(`refund #2 (retry): ${second.error.message}`);
  if (!second.data?.already_refunded && second.data?.status !== "refunded") {
    fail("retry should report already refunded / refunded");
  }

  const { payment, txs } = await ledgerCodesForRequest(order.requestId);
  if (payment.status !== "refunded") fail("payment not refunded");
  assertFullRefundLedger(payment, txs);

  const refundRows = txs.filter(
    (t) => (t.ledger_code || t.type) === "customer_refund" || t.type === "refund"
  );
  if (refundRows.length !== 1) fail(`expected 1 customer_refund row, got ${refundRows.length}`);
  const earnRevRows = txs.filter((t) => t.ledger_code === "provider_earning_reversal");
  const feeRevRows = txs.filter((t) => t.ledger_code === "platform_commission_reversal");
  if (earnRevRows.length !== 1) fail(`duplicate earning reversals: ${earnRevRows.length}`);
  if (feeRevRows.length !== 1) fail(`duplicate commission reversals: ${feeRevRows.length}`);
  pass("idempotent refund retry — no duplicate ledger rows");
}

// --- Dispute after work (no auto refund) ---
{
  const order = await createPaidOrder({ withWork: true });
  if (!anon) {
    console.log("No anon key — skipping authenticated dispute RPC");
  } else {
    const custClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signErr } = await custClient.auth.signInWithPassword({
      email: order.customerEmail,
      password: order.password,
    });
    if (signErr) fail(`customer login: ${signErr.message}`);

    const reason = "Work quality issue for ledger dispute fixture";
    const { data: d1, error: e1 } = await custClient.rpc("open_order_dispute", {
      p_request_id: order.requestId,
      p_reason: reason,
    });
    if (e1) fail(`open dispute: ${e1.message}`);

    const { data: d2, error: e2 } = await custClient.rpc("open_order_dispute", {
      p_request_id: order.requestId,
      p_reason: reason,
    });
    if (e2) fail(`dispute retry: ${e2.message}`);
    if (!d2?.already_opened) fail("dispute retry should be already_opened");

    const { data: request } = await admin
      .from("requests")
      .select("refund_dispute_status, order_payment_status, status")
      .eq("id", order.requestId)
      .single();
    if (request.refund_dispute_status !== "dispute_opened") fail("dispute status not set");
    if (request.order_payment_status !== "paid") fail("dispute must not auto-refund payment");

    const { payment, txs } = await ledgerCodesForRequest(order.requestId);
    if (payment.status !== "paid") fail("payment should stay paid after dispute");
    if (txs.some((t) => (t.ledger_code || t.type) === "customer_refund")) {
      fail("dispute path must not write customer_refund");
    }
    if (!txs.some((t) => t.ledger_code === "dispute_opened")) {
      fail("missing dispute_opened ledger memo");
    }
    pass(`dispute opened idempotently (dispute_id=${d1?.dispute_id})`);
  }
}

pass("verify-ledger-refund-flow done");
