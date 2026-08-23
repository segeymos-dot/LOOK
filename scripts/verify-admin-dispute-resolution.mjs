#!/usr/bin/env node
/**
 * Verify admin dispute resolution RPC: preview, full refund, provider win,
 * partial split, and idempotent retry. Local/dev only.
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

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) {
  console.log("Skipping admin dispute tests (missing env)");
  process.exit(0);
}

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: adminProfile } = await admin
  .from("profiles")
  .select("id")
  .eq("is_platform_admin", true)
  .limit(1)
  .maybeSingle();

if (!adminProfile?.id) fail("No platform admin profile for resolve_order_dispute");

async function createDisputedOrder() {
  const stamp = Date.now();
  const password = "TestPass123!";
  const cust = await admin.auth.admin.createUser({
    email: `disp-cust-${stamp}@look.local`,
    password,
    email_confirm: true,
  });
  const prov = await admin.auth.admin.createUser({
    email: `disp-prov-${stamp}@look.local`,
    password,
    email_confirm: true,
  });
  if (cust.error || prov.error) fail(cust.error?.message || prov.error?.message);

  await admin.from("profiles").upsert([
    { id: cust.data.user.id, email: `disp-cust-${stamp}@look.local`, full_name: "Disp Customer", role: "customer" },
    { id: prov.data.user.id, email: `disp-prov-${stamp}@look.local`, full_name: "Disp Provider", role: "provider" },
  ]);

  const { data: request, error: reqErr } = await admin
    .from("requests")
    .insert({
      customer_id: cust.data.user.id,
      title: `Admin dispute fixture ${stamp}`,
      description: "Fixture",
      status: "in_progress",
      currency: "USD",
      budget_max: 100,
    })
    .select("id")
    .single();
  if (reqErr) fail(reqErr.message);

  await admin.from("offers").insert({
    request_id: request.id,
    provider_id: prov.data.user.id,
    price: 100,
    currency: "USD",
    message: "offer",
    status: "accepted",
    estimated_days: 2,
  });

  const { error: payErr } = await admin.rpc("simulate_test_payment", {
    p_request_id: request.id,
    p_external_reference: `disp-${randomUUID()}`,
  });
  if (payErr) fail(payErr.message);

  await admin.from("work_submissions").insert({
    request_id: request.id,
    provider_id: prov.data.user.id,
    summary: "Submitted for dispute",
    revision_number: 1,
  });
  await admin
    .from("requests")
    .update({ status: "pending_review", work_submitted_at: new Date().toISOString() })
    .eq("id", request.id);

  // Open dispute via direct insert + status (service role) to avoid auth.uid() RPC
  const { data: payment } = await admin
    .from("payments")
    .select("id")
    .eq("request_id", request.id)
    .maybeSingle();

  const { data: dispute, error: dErr } = await admin
    .from("order_disputes")
    .insert({
      request_id: request.id,
      payment_id: payment.id,
      opened_by: cust.data.user.id,
      reason: "Admin resolution fixture dispute reason text",
      status: "opened",
    })
    .select("id")
    .single();
  if (dErr) fail(dErr.message);

  await admin
    .from("requests")
    .update({ refund_dispute_status: "dispute_opened" })
    .eq("id", request.id);

  return {
    requestId: request.id,
    disputeId: dispute.id,
    providerId: prov.data.user.id,
    customerId: cust.data.user.id,
  };
}

// Probe RPC
{
  const { error } = await admin.rpc("preview_dispute_settlement", {
    p_dispute_id: "00000000-0000-0000-0000-000000000000",
    p_decision: "reject",
  });
  if (error?.message?.includes("Could not find") || error?.message?.includes("PGRST202")) {
    fail("preview_dispute_settlement missing — apply migration 037");
  }
  pass(`preview RPC reachable (${error?.message || "ok"})`);
}

// Full refund
{
  const order = await createDisputedOrder();
  const preview = await admin.rpc("preview_dispute_settlement", {
    p_dispute_id: order.disputeId,
    p_decision: "full_refund_customer",
  });
  if (preview.error) fail(preview.error.message);
  if (Number(preview.data.customer_refund) !== 100) fail("full refund preview amount");

  const first = await admin.rpc("resolve_order_dispute", {
    p_dispute_id: order.disputeId,
    p_admin_id: adminProfile.id,
    p_decision: "full_refund_customer",
    p_resolution_note: "Full refund after review",
    p_idempotency_key: `${order.disputeId}:full`,
  });
  if (first.error) fail(first.error.message);

  const retry = await admin.rpc("resolve_order_dispute", {
    p_dispute_id: order.disputeId,
    p_admin_id: adminProfile.id,
    p_decision: "full_refund_customer",
    p_resolution_note: "Full refund after review",
    p_idempotency_key: `${order.disputeId}:full`,
  });
  if (retry.error) fail(retry.error.message);
  if (!retry.data.already_resolved) fail("retry must be already_resolved");

  const { data: txs } = await admin
    .from("transactions")
    .select("ledger_code")
    .eq("payment_id", first.data.payment_id)
    .eq("status", "completed");
  const codes = (txs || []).map((t) => t.ledger_code);
  for (const c of ["customer_refund", "provider_earning_reversal", "platform_commission_reversal", "dispute_resolved"]) {
    if (!codes.includes(c)) fail(`missing ledger ${c}`);
  }
  if (codes.filter((c) => c === "customer_refund").length !== 1) fail("duplicate customer_refund");
  pass("full refund + idempotent retry");
}

// Provider win
{
  const order = await createDisputedOrder();
  const { data: balBefore } = await admin
    .from("provider_balances")
    .select("available_balance")
    .eq("provider_id", order.providerId)
    .maybeSingle();

  const res = await admin.rpc("resolve_order_dispute", {
    p_dispute_id: order.disputeId,
    p_admin_id: adminProfile.id,
    p_decision: "release_full_payout",
    p_resolution_note: "Provider wins — work accepted",
  });
  if (res.error) fail(res.error.message);

  const { data: balAfter } = await admin
    .from("provider_balances")
    .select("available_balance")
    .eq("provider_id", order.providerId)
    .maybeSingle();
  if (Number(balAfter.available_balance) !== Number(balBefore.available_balance)) {
    fail("provider win must not claw back balance");
  }
  const { data: d } = await admin.from("order_disputes").select("status").eq("id", order.disputeId).single();
  if (d.status !== "closed") fail("provider win status should be closed");
  pass("provider win (release full payout)");
}

// Partial split
{
  const order = await createDisputedOrder();
  const res = await admin.rpc("resolve_order_dispute", {
    p_dispute_id: order.disputeId,
    p_admin_id: adminProfile.id,
    p_decision: "split_settlement",
    p_resolution_note: "Split 40 customer / 50 provider",
    p_customer_refund: 40,
    p_provider_release: 50,
  });
  if (res.error) fail(res.error.message);
  if (Number(res.data.customer_refund) !== 40) fail("split customer refund");
  if (Number(res.data.provider_release) !== 50) fail("split provider release");
  if (Number(res.data.platform_fee_retained) !== 10) fail("split platform keep");
  pass("partial split settlement");
}

pass("verify-admin-dispute-resolution done");
