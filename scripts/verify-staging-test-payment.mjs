#!/usr/bin/env node
/**
 * LOOK Staging: accept seed offer → simulate_test_payment → verify paid + history.
 * Uses .env.staging.local only. No Stripe. Never prints secrets/passwords.
 *
 * Prerequisites: node scripts/seed-staging-scenario.mjs
 * Usage: node scripts/verify-staging-test-payment.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

/** Mirrors src/lib/payments/test-payments-guard.ts (keep in sync). */
function isProductionRuntime(env) {
  const vercelEnv = env.VERCEL_ENV?.trim();
  if (vercelEnv) return vercelEnv === "production";
  return env.NODE_ENV === "production";
}
function areTestPaymentsEnabled(env) {
  if (isProductionRuntime(env)) return false;
  return env.ENABLE_TEST_PAYMENTS === "true";
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stagingEnvPath = resolve(root, ".env.staging.local");
const localEnvPath = resolve(root, ".env.local");

const CUSTOMER_EMAIL = "customer@test.look";
const PROVIDER_EMAIL = "provider@test.look";
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
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const service = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const projectId = env.SUPABASE_PROJECT_ID?.trim();
  if (!url || !anon || !service || !projectId) {
    throw new Error("Missing staging keys in .env.staging.local");
  }
  if (projectRefFromUrl(url) !== projectId) {
    throw new Error("Staging URL ref does not match SUPABASE_PROJECT_ID");
  }
  const local = loadEnvFile(localEnvPath);
  if (local.NEXT_PUBLIC_SUPABASE_URL?.trim() === url) {
    throw new Error("Staging URL equals .env.local — refusing");
  }
  return { url, anon, service };
}

function promptPasswordHidden() {
  const r = spawnSync(
    "osascript",
    [
      "-e",
      `set theValue to text returned of (display dialog "Enter shared LOOK Staging test password (hidden)." with title "LOOK Staging payment verify" default answer "" with hidden answer buttons {"Cancel", "OK"} default button "OK" cancel button "Cancel")
return theValue`,
    ],
    { encoding: "utf8" }
  );
  if (r.status !== 0) throw new Error("Password prompt cancelled");
  return r.stdout.trim();
}

async function signIn(url, anon, email, password) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.access_token || !body.user?.id) {
    throw new Error(
      `sign-in failed for ${email}: ${body.msg || body.error || res.status}`
    );
  }
  return { token: body.access_token, userId: body.user.id };
}

async function resolvePassword(url, anon) {
  for (const password of [
    process.env.LOOK_STAGING_TEST_PASSWORD?.trim(),
    "Test1234!",
  ].filter(Boolean)) {
    try {
      await signIn(url, anon, CUSTOMER_EMAIL, password);
      return password;
    } catch {
      /* next */
    }
  }
  return promptPasswordHidden();
}

function line(label, detail, result) {
  console.log(`${label} | ${detail} | ${result}`);
}

async function main() {
  // Guard unit checks (Preview-safe, Production hard-deny)
  const previewEnabled = areTestPaymentsEnabled({
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    ENABLE_TEST_PAYMENTS: "true",
  });
  const productionDenied = !areTestPaymentsEnabled({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    ENABLE_TEST_PAYMENTS: "true",
  });
  line(
    "guard: Preview ENABLE_TEST_PAYMENTS",
    "VERCEL_ENV=preview",
    previewEnabled ? "PASS" : "FAIL"
  );
  line(
    "guard: Production hard-deny",
    "VERCEL_ENV=production",
    productionDenied && isProductionRuntime({ VERCEL_ENV: "production" })
      ? "PASS"
      : "FAIL"
  );

  if (!existsSync(stagingEnvPath)) throw new Error("Missing .env.staging.local");
  const { url, anon, service } = assertStagingOnly(loadEnvFile(stagingEnvPath));

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const password = await resolvePassword(url, anon);
  const customerAuth = await signIn(url, anon, CUSTOMER_EMAIL, password);
  await signIn(url, anon, PROVIDER_EMAIL, password);

  const customer = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${customerAuth.token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: request, error: reqErr } = await admin
    .from("requests")
    .select("id, title, status, order_payment_status, customer_id")
    .eq("customer_id", customerAuth.userId)
    .eq("title", REQUEST_TITLE)
    .maybeSingle();
  if (reqErr || !request) {
    throw new Error(
      "Seed request missing — run: node scripts/seed-staging-scenario.mjs"
    );
  }

  const { data: offer, error: offerErr } = await admin
    .from("offers")
    .select("id, status, message, provider_id")
    .eq("request_id", request.id)
    .maybeSingle();
  if (offerErr || !offer) throw new Error("Seed offer missing");

  // Accept offer if still pending (customer RPC).
  let acceptAction = "skipped";
  if (offer.status === "pending") {
    const { error: acceptError } = await customer.rpc("accept_offer", {
      p_offer_id: offer.id,
    });
    if (acceptError) throw new Error(`accept_offer: ${acceptError.message}`);
    acceptAction = "accepted";
  } else if (offer.status === "accepted") {
    acceptAction = "already_accepted";
  } else {
    throw new Error(`Unexpected offer status: ${offer.status}`);
  }

  const { data: afterAccept } = await admin
    .from("requests")
    .select("id, status, order_payment_status")
    .eq("id", request.id)
    .single();

  line(
    `offer (${acceptAction})`,
    `status→accepted; request→${afterAccept?.status}/${afterAccept?.order_payment_status}`,
    afterAccept?.status === "in_progress" &&
      ["unpaid", "payment_pending", "paid"].includes(
        afterAccept?.order_payment_status
      )
      ? "PASS"
      : "FAIL"
  );

  // Simulate test payment (same RPC path as executeTestOrderPayment).
  let payAction = "skipped";
  if (afterAccept?.order_payment_status !== "paid") {
    let { data: payData, error: payError } = await admin.rpc(
      "simulate_test_payment",
      {
        p_request_id: request.id,
        p_external_reference: "staging-seed-test-pay",
      }
    );
    if (payError?.message?.includes("p_external_reference")) {
      ({ data: payData, error: payError } = await admin.rpc(
        "simulate_test_payment",
        { p_request_id: request.id }
      ));
    }
    if (payError) throw new Error(`simulate_test_payment: ${payError.message}`);
    if (!payData) throw new Error("simulate_test_payment returned empty");
    payAction = "paid";
  } else {
    payAction = "already_paid";
  }

  const { data: paidRequest, error: paidErr } = await admin
    .from("requests")
    .select(
      "id, title, status, order_payment_status, payment_provider_name, order_amount"
    )
    .eq("id", request.id)
    .single();
  if (paidErr) throw new Error(paidErr.message);

  const requestPaidOk =
    paidRequest?.order_payment_status === "paid" &&
    paidRequest?.status === "in_progress";

  line(
    `request (${payAction}): ${paidRequest.title}`,
    `${paidRequest.status}/${paidRequest.order_payment_status}`,
    requestPaidOk ? "PASS" : "FAIL"
  );

  const { data: payment, error: paymentErr } = await admin
    .from("payments")
    .select("id, status, payment_method, amount_gross, request_id")
    .eq("request_id", request.id)
    .eq("status", "paid")
    .maybeSingle();
  if (paymentErr) throw new Error(paymentErr.message);

  line(
    "payment row",
    payment
      ? `${payment.payment_method || "n/a"}/${payment.status}`
      : "missing",
    payment?.status === "paid" ? "PASS" : "FAIL"
  );

  // Customer-visible history (RLS), same tables payment-history uses.
  const history = await customer
    .from("payments")
    .select("id, status, request_id, amount_gross")
    .eq("request_id", request.id)
    .eq("status", "paid")
    .maybeSingle();

  const customerView = await customer
    .from("requests")
    .select("id, order_payment_status, status")
    .eq("id", request.id)
    .maybeSingle();

  line(
    "visibility: customer sees paid request",
    customerView.data
      ? `${customerView.data.status}/${customerView.data.order_payment_status}`
      : "missing",
    !customerView.error &&
      customerView.data?.order_payment_status === "paid"
      ? "PASS"
      : "FAIL"
  );
  line(
    "visibility: customer payment history",
    history.data ? `paid` : "missing",
    !history.error && history.data?.status === "paid" ? "PASS" : "FAIL"
  );

  const allPass =
    previewEnabled &&
    productionDenied &&
    requestPaidOk &&
    payment?.status === "paid" &&
    customerView.data?.order_payment_status === "paid" &&
    history.data?.status === "paid";

  console.log(allPass ? "OVERALL: PASS" : "OVERALL: FAIL");
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("FAIL:", redact(err?.message || err));
  process.exit(1);
});
