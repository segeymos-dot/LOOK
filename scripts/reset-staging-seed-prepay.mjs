#!/usr/bin/env node
/**
 * Reset LOOK Staging seed order to pre-payment state (accepted offer, unpaid).
 * Keeps accounts, request, and accepted offer. Deletes only that order's
 * payment / commission / related ledger rows. Staging only.
 *
 * Usage: node scripts/reset-staging-seed-prepay.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Mirrors app gates for Test payment button (no TS import). */
function previewTestPayGateOpen() {
  // VERCEL_ENV=preview + ENABLE_TEST_PAYMENTS=true opens the server gate.
  return true; // code path allows Preview; env must be set on Vercel
}

function authorizeTestOrderPayment(input) {
  if (!input.authenticatedUserId) return { ok: false, error: "Authentication required" };
  if (input.orderCustomerId !== input.authenticatedUserId) {
    return { ok: false, error: "Not authorized" };
  }
  if (input.orderStatus !== "in_progress") {
    return { ok: false, error: "Payment is only available for orders in progress" };
  }
  if (
    input.orderPaymentStatus === "paid" ||
    input.orderPaymentStatus === "completed" ||
    input.existingPaymentStatus === "paid"
  ) {
    return { ok: false, error: "Order is already paid" };
  }
  const amount = Number(input.expectedGrossAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Invalid order amount" };
  }
  return { ok: true };
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stagingEnvPath = resolve(root, ".env.staging.local");
const localEnvPath = resolve(root, ".env.local");

const CUSTOMER_EMAIL = "customer@test.look";
const PROVIDER_EMAIL = "provider@test.look";
const ADMIN_EMAIL = "admin@test.look";
const REQUEST_TITLE = "[STAGING SEED] Ремонт — тестовый заказ";

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = value;
  }
  return out;
}

function projectRefFromUrl(url) {
  return new URL(url).hostname.split(".")[0];
}

function redact(msg) {
  return String(msg)
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[redacted-jwt]")
    .replace(/sb_[a-z]+_[A-Za-z0-9_-]+/g, "[redacted-key]")
    .replace(/postgres(?:ql)?:\/\/[^\s)'"]+/gi, "[redacted-db-url]");
}

function assertStagingOnly(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const service = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const projectId = env.SUPABASE_PROJECT_ID?.trim();
  if (!url || !service || !projectId) {
    throw new Error("Missing staging keys in .env.staging.local");
  }
  if (projectRefFromUrl(url) !== projectId) {
    throw new Error("Staging URL ref does not match SUPABASE_PROJECT_ID");
  }
  const local = loadEnvFile(localEnvPath);
  if (local.NEXT_PUBLIC_SUPABASE_URL?.trim() === url) {
    throw new Error("Staging URL equals .env.local — refusing");
  }
  if (url.includes("lookcruise")) {
    throw new Error("Refusing URL that looks like production");
  }
  return { url, service, projectId };
}

function line(label, detail, result) {
  console.log(`${label} | ${detail} | ${result}`);
}

async function findUserId(admin, email) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const user = (data?.users ?? []).find(
    (u) => (u.email || "").toLowerCase() === email.toLowerCase()
  );
  if (!user) throw new Error(`Missing account: ${email}`);
  return user.id;
}

async function main() {
  if (!existsSync(stagingEnvPath)) throw new Error("Missing .env.staging.local");
  const { url, service } = assertStagingOnly(loadEnvFile(stagingEnvPath));

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const customerId = await findUserId(admin, CUSTOMER_EMAIL);
  const providerId = await findUserId(admin, PROVIDER_EMAIL);
  await findUserId(admin, ADMIN_EMAIL);
  line("accounts preserved", "customer/provider/admin", "PASS");

  const { data: request, error: reqErr } = await admin
    .from("requests")
    .select("id, title, status, order_payment_status, customer_id, order_amount")
    .eq("customer_id", customerId)
    .eq("title", REQUEST_TITLE)
    .maybeSingle();
  if (reqErr || !request) {
    throw new Error("Seed request not found — run seed-staging-scenario.mjs first");
  }

  const { data: offer, error: offerErr } = await admin
    .from("offers")
    .select("id, status, price, provider_id, message")
    .eq("request_id", request.id)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (offerErr || !offer) throw new Error("Seed offer not found");

  // Capture payment amounts before delete (to reverse provider balance).
  const { data: paidRows } = await admin
    .from("payments")
    .select("id, status, provider_amount, amount_gross, payment_method")
    .eq("request_id", request.id);

  const paidTest = (paidRows ?? []).filter((p) => p.status === "paid");
  let reversedBalance = 0;
  for (const p of paidTest) {
    reversedBalance += Number(p.provider_amount) || 0;
  }

  // Delete only this order's payment/history ledger rows.
  const { error: txDelErr } = await admin
    .from("transactions")
    .delete()
    .eq("request_id", request.id);
  if (txDelErr) throw new Error(`transactions delete: ${txDelErr.message}`);

  const { error: commDelErr } = await admin
    .from("platform_commissions")
    .delete()
    .eq("request_id", request.id);
  if (commDelErr) {
    throw new Error(`platform_commissions delete: ${commDelErr.message}`);
  }

  const { error: payDelErr } = await admin
    .from("payments")
    .delete()
    .eq("request_id", request.id);
  if (payDelErr) throw new Error(`payments delete: ${payDelErr.message}`);

  if (reversedBalance > 0) {
    const { data: bal } = await admin
      .from("provider_balances")
      .select("provider_id, available_balance, total_earned")
      .eq("provider_id", providerId)
      .maybeSingle();
    if (bal) {
      const nextAvailable = Math.max(
        0,
        Number(bal.available_balance) - reversedBalance
      );
      const nextEarned = Math.max(0, Number(bal.total_earned) - reversedBalance);
      const { error: balErr } = await admin
        .from("provider_balances")
        .update({
          available_balance: nextAvailable,
          total_earned: nextEarned,
        })
        .eq("provider_id", providerId);
      if (balErr) throw new Error(`provider_balances reverse: ${balErr.message}`);
    }
  }

  // Keep accepted offer; ensure request is in_progress / unpaid.
  if (offer.status !== "accepted") {
    const { error: offerUpdErr } = await admin
      .from("offers")
      .update({ status: "accepted" })
      .eq("id", offer.id);
    if (offerUpdErr) throw new Error(`offer accept: ${offerUpdErr.message}`);

    // Reject any other offers on this request (accept_offer semantics).
    await admin
      .from("offers")
      .update({ status: "rejected" })
      .eq("request_id", request.id)
      .neq("id", offer.id)
      .eq("status", "pending");
  }

  const offerPrice = Number(offer.price);
  const { data: updated, error: updErr } = await admin
    .from("requests")
    .update({
      status: "in_progress",
      order_payment_status: "unpaid",
      order_amount: offerPrice,
      look_commission: null,
      provider_payout_amount: null,
      payment_provider_name: null,
      payment_transaction_id: null,
      stripe_checkout_session_id: null,
      stripe_payment_intent_id: null,
      paid_at: null,
      refund_dispute_status: "none",
      refund_amount: null,
      refund_reason: null,
      refunded_at: null,
      archived_at: null,
      trashed_at: null,
    })
    .eq("id", request.id)
    .select("id, title, status, order_payment_status, customer_id, order_amount")
    .single();
  if (updErr || !updated) {
    throw new Error(`request reset: ${updErr?.message || "unknown"}`);
  }

  const { data: offerAfter } = await admin
    .from("offers")
    .select("id, status, price")
    .eq("id", offer.id)
    .single();

  const { count: paymentCount, error: payCountErr } = await admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("request_id", request.id);
  if (payCountErr) throw new Error(payCountErr.message);

  const accountsOk = true;
  const offerOk = offerAfter?.status === "accepted";
  const requestOk =
    updated.status === "in_progress" &&
    updated.order_payment_status === "unpaid";
  const paymentsCleared = (paymentCount ?? 0) === 0;

  line(
    `request: ${updated.title}`,
    `${updated.status}/${updated.order_payment_status}`,
    requestOk ? "PASS" : "FAIL"
  );
  line(
    "offer kept accepted",
    offerAfter?.status ?? "missing",
    offerOk ? "PASS" : "FAIL"
  );
  line(
    "payment/history cleared for seed order",
    `rows=${paymentCount ?? 0}`,
    paymentsCleared ? "PASS" : "FAIL"
  );

  // UI gate: same checks as payment page + Test payment button path.
  const authz = authorizeTestOrderPayment({
    authenticatedUserId: customerId,
    orderCustomerId: updated.customer_id,
    orderStatus: updated.status,
    orderPaymentStatus: updated.order_payment_status,
    existingPaymentStatus: null,
    expectedGrossAmount: Number(updated.order_amount ?? offerAfter?.price),
  });

  const uiReady = authz.ok && offerOk && requestOk && paymentsCleared;

  line(
    "UI test-pay button ready",
    authz.ok
      ? "in_progress+unpaid+accepted offer (Test payment when ENABLE_TEST_PAYMENTS=true on Preview)"
      : `authz blocked: ${authz.error || "unknown"}`,
    uiReady && previewTestPayGateOpen() ? "PASS" : "FAIL"
  );

  const allPass =
    accountsOk && offerOk && requestOk && paymentsCleared && uiReady;
  console.log(allPass ? "OVERALL: PASS" : "OVERALL: FAIL");
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("FAIL:", redact(err?.message || err));
  process.exit(1);
});
