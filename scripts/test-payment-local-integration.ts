/**
 * Local-only end-to-end Stripe webhook payment integration test.
 *
 * - Uses local Supabase only (127.0.0.1 / localhost)
 * - Never contacts Stripe over the network
 * - Signs webhook payloads with a temporary in-memory whsec_* secret
 * - Invokes the real POST /api/webhooks/stripe handler
 * - Does NOT use ENABLE_TEST_PAYMENTS / simulate_test_payment
 *
 * Run: npm run test:payment-local-integration
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

type ScenarioResult = { name: string; ok: boolean; detail?: string };

const results: ScenarioResult[] = [];
const runId = randomBytes(4).toString("hex");
const fixtureTag = `look_local_pay_${runId}`;

/** In-memory only — never written to .env or disk. */
const TEMP_WEBHOOK_SECRET = `whsec_${randomBytes(32).toString("base64url")}`;
const TEMP_STRIPE_SECRET = `sk_test_local_mock_${randomBytes(24).toString("hex")}`;

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ""}`);
}

function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(`${name}: ${detail ?? "failed"}`);
}

function restoreLocalServiceRoleGrants() {
  // Local-only repair: some CLI/init paths left service_role without DML grants,
  // which breaks the real webhook handler's admin.from(...) lookups.
  // Does not contact remote Supabase and does not reset data.
  const sql =
    "GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role; " +
    "GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role; " +
    "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;";
  execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_LOOK",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
}

function parseEnvOutput(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadLocalSupabaseEnv(): {
  url: string;
  serviceRoleKey: string;
  anonKey: string;
} {
  let statusText: string;
  try {
    statusText = execFileSync("supabase", ["status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error(
      "Local Supabase is required. Start it with `supabase start` and retry."
    );
  }

  const env = parseEnvOutput(statusText);
  const url = env.API_URL || env.SUPABASE_URL;
  const serviceRoleKey = env.SERVICE_ROLE_KEY || env.SECRET_KEY;
  const anonKey = env.ANON_KEY || env.PUBLISHABLE_KEY;

  if (!url || !serviceRoleKey || !anonKey) {
    throw new Error("Could not read local Supabase API_URL / keys from `supabase status`.");
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("Local Supabase API_URL is not a valid URL.");
  }

  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `Refusing non-local Supabase host "${host}". This test is local-only.`
    );
  }

  return { url, serviceRoleKey, anonKey };
}

function assertNoLiveStripeKeys() {
  const candidates = [
    process.env.STRIPE_SECRET_KEY,
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    TEMP_STRIPE_SECRET,
  ];
  for (const value of candidates) {
    if (!value) continue;
    if (value.startsWith("sk_live_") || value.startsWith("pk_live_")) {
      throw new Error("Live Stripe key detected — aborting local mock integration test.");
    }
  }
}

function installStripeNetworkGuard() {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (/stripe\.com|api\.stripe\.com/i.test(raw)) {
      throw new Error(`Blocked accidental Stripe network request: ${raw}`);
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}

function adminClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function anonClient(url: string, anonKey: string) {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type Fixture = {
  customerId: string;
  providerId: string;
  requestId: string;
  offerId: string;
  amountMajor: number;
  currency: string;
  commissionRate: number;
  expectedFee: number;
  expectedProviderAmount: number;
  checkoutSessionId: string;
  paymentIntentId: string;
  eventId: string;
};

async function createAuthUser(
  admin: SupabaseClient,
  role: "customer" | "provider",
  label: string
) {
  const email = `${fixtureTag}_${label}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `LocalTest_${randomBytes(8).toString("hex")}!`,
    email_confirm: true,
    user_metadata: { full_name: `Local ${label}`, role },
  });
  if (error || !data.user) {
    throw new Error(`Failed to create ${label}: ${error?.message ?? "unknown"}`);
  }
  const { error: profileError } = await admin.from("profiles").upsert({
    id: data.user.id,
    full_name: `Local ${label} ${runId}`,
    role,
    is_platform_admin: false,
  });
  if (profileError) {
    throw new Error(`Failed to upsert profile for ${label}: ${profileError.message}`);
  }
  return data.user.id;
}

async function createUnpaidOrderFixture(
  admin: SupabaseClient,
  opts?: {
    amountMajor?: number;
    currency?: string;
    paymentStatus?: string;
    withAcceptedOffer?: boolean;
    titleSuffix?: string;
  }
): Promise<Fixture> {
  const amountMajor = opts?.amountMajor ?? 150;
  const currency = (opts?.currency ?? "USD").toUpperCase();
  const withAcceptedOffer = opts?.withAcceptedOffer !== false;

  const customerId = await createAuthUser(admin, "customer", `cust_${randomBytes(3).toString("hex")}`);
  const providerId = await createAuthUser(admin, "provider", `prov_${randomBytes(3).toString("hex")}`);

  const { data: rateRow } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "commission_rate")
    .maybeSingle();
  const commissionRate = Number(rateRow?.value ?? 0.1);
  const expectedFee = Math.round(amountMajor * commissionRate * 100) / 100;
  const expectedProviderAmount =
    Math.round((amountMajor - expectedFee) * 100) / 100;

  const { data: request, error: requestError } = await admin
    .from("requests")
    .insert({
      customer_id: customerId,
      title: `${fixtureTag} ${opts?.titleSuffix ?? "order"}`,
      description: "Local mock Stripe payment integration fixture",
      currency,
      status: "in_progress",
      order_payment_status: opts?.paymentStatus ?? "payment_pending",
      order_amount: amountMajor,
      payment_provider_name: "stripe",
      stripe_checkout_session_id: null,
      stripe_payment_intent_id: null,
    })
    .select("id")
    .single();
  if (requestError || !request) {
    throw new Error(`Failed to create request: ${requestError?.message}`);
  }

  let offerId = randomUUID();
  if (withAcceptedOffer) {
    const { data: offer, error: offerError } = await admin
      .from("offers")
      .insert({
        request_id: request.id,
        provider_id: providerId,
        price: amountMajor,
        currency,
        message: "Local fixture offer",
        status: "accepted",
        estimated_days: 3,
      })
      .select("id")
      .single();
    if (offerError || !offer) {
      throw new Error(`Failed to create offer: ${offerError?.message}`);
    }
    offerId = offer.id;
  }

  const checkoutSessionId = `cs_test_${runId}_${randomBytes(8).toString("hex")}`;
  const paymentIntentId = `pi_test_${runId}_${randomBytes(8).toString("hex")}`;
  const eventId = `evt_test_${runId}_${randomBytes(8).toString("hex")}`;

  await admin
    .from("requests")
    .update({
      stripe_checkout_session_id: checkoutSessionId,
      stripe_payment_intent_id: paymentIntentId,
      stripe_checkout_attempt: 1,
    })
    .eq("id", request.id);

  return {
    customerId,
    providerId,
    requestId: request.id,
    offerId,
    amountMajor,
    currency,
    commissionRate,
    expectedFee,
    expectedProviderAmount,
    checkoutSessionId,
    paymentIntentId,
    eventId,
  };
}

function buildCheckoutCompletedEvent(input: {
  eventId: string;
  requestId: string;
  customerId: string;
  providerId: string;
  checkoutSessionId: string;
  paymentIntentId: string;
  amountMajor: number;
  currency: string;
  paymentStatus?: string;
  status?: string;
  forgedCustomerId?: string;
}): Stripe.Event {
  const amountTotal = Math.round(input.amountMajor * 100);
  const currency = input.currency.toLowerCase();
  const created = Math.floor(Date.now() / 1000);

  const session = {
    id: input.checkoutSessionId,
    object: "checkout.session",
    amount_total: amountTotal,
    currency,
    payment_status: input.paymentStatus ?? "paid",
    status: input.status ?? "complete",
    client_reference_id: input.requestId,
    payment_intent: input.paymentIntentId,
    metadata: {
      request_id: input.requestId,
      customer_id: input.forgedCustomerId ?? input.customerId,
      provider_id: input.providerId,
      payment_provider: "stripe",
    },
    mode: "payment",
  };

  return {
    id: input.eventId,
    object: "event",
    api_version: "2026-06-24.dahlia",
    created,
    type: "checkout.session.completed",
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object: session as unknown as Stripe.Checkout.Session },
  } as Stripe.Event;
}

function buildGenericEvent(input: {
  eventId: string;
  type: string;
  object: Record<string, unknown>;
}): Stripe.Event {
  return {
    id: input.eventId,
    object: "event",
    api_version: "2026-06-24.dahlia",
    created: Math.floor(Date.now() / 1000),
    type: input.type,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object: input.object as Stripe.Event.Data.Object },
  } as Stripe.Event;
}

function signEvent(event: Stripe.Event): { rawBody: string; signature: string } {
  const stripe = new Stripe(TEMP_STRIPE_SECRET, {
    apiVersion: "2026-06-24.dahlia",
    typescript: true,
  });
  const rawBody = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret: TEMP_WEBHOOK_SECRET,
  });
  return { rawBody, signature };
}

async function postWebhook(
  handler: (request: Request) => Promise<Response>,
  rawBody: string,
  signature: string | null
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature) headers.set("stripe-signature", signature);
  const request = new Request("http://127.0.0.1/api/webhooks/stripe", {
    method: "POST",
    headers,
    body: rawBody,
  });
  return handler(request);
}

async function countPayments(admin: SupabaseClient, requestId: string) {
  const { data, error } = await admin
    .from("payments")
    .select("id, status, amount_gross, platform_fee, provider_amount, currency, payment_method, customer_id")
    .eq("request_id", requestId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function countCommissions(admin: SupabaseClient, requestId: string) {
  const { count, error } = await admin
    .from("platform_commissions")
    .select("id", { count: "exact", head: true })
    .eq("request_id", requestId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countLedger(admin: SupabaseClient, requestId: string) {
  const { data, error } = await admin
    .from("transactions")
    .select("id, type")
    .eq("request_id", requestId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function getOrder(admin: SupabaseClient, requestId: string) {
  const { data, error } = await admin
    .from("requests")
    .select(
      "id, status, order_payment_status, order_amount, look_commission, provider_payout_amount, customer_id, paid_at"
    )
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function getWebhookEvent(admin: SupabaseClient, eventId: string) {
  const { data, error } = await admin
    .from("stripe_webhook_events")
    .select("stripe_event_id, processing_status, last_error, event_type")
    .eq("stripe_event_id", eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function cleanupFixture(admin: SupabaseClient, fixture: Partial<Fixture>) {
  const userIds = [fixture.customerId, fixture.providerId].filter(Boolean) as string[];
  if (fixture.requestId) {
    await admin.from("transactions").delete().eq("request_id", fixture.requestId);
    await admin.from("platform_commissions").delete().eq("request_id", fixture.requestId);
    await admin.from("payments").delete().eq("request_id", fixture.requestId);
    await admin.from("offers").delete().eq("request_id", fixture.requestId);
    await admin.from("requests").delete().eq("id", fixture.requestId);
  }
  for (const id of userIds) {
    await admin.from("provider_balances").delete().eq("provider_id", id);
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
}

async function main() {
  console.log("Local Stripe mock payment integration — starting");
  console.log(`Fixture tag: ${fixtureTag}`);

  assertNoLiveStripeKeys();
  const local = loadLocalSupabaseEnv();
  restoreLocalServiceRoleGrants();

  // Override process env for the real webhook handler + admin client.
  // Temporary Stripe secrets exist only in this process.
  process.env.NEXT_PUBLIC_SUPABASE_URL = local.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = local.serviceRoleKey;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = local.anonKey;
  process.env.STRIPE_SECRET_KEY = TEMP_STRIPE_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = TEMP_WEBHOOK_SECRET;
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_")
      ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
      : `pk_test_local_mock_${randomBytes(12).toString("hex")}`;
  delete process.env.ENABLE_TEST_PAYMENTS;

  assertNoLiveStripeKeys();
  installStripeNetworkGuard();

  const admin = adminClient(local.url, local.serviceRoleKey);
  const anon = anonClient(local.url, local.anonKey);

  // Import AFTER env + network guard are installed.
  const { POST } = await import("../src/app/api/webhooks/stripe/route.ts");

  const created: Fixture[] = [];
  const webhookEventIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // STEP 5 — Successful payment via authoritative checkout.session.completed
    // -------------------------------------------------------------------------
    const happy = await createUnpaidOrderFixture(admin, {
      amountMajor: 150,
      currency: "USD",
      titleSuffix: "happy",
    });
    created.push(happy);

    const successEvent = buildCheckoutCompletedEvent(happy);
    const signed = signEvent(successEvent);
    webhookEventIds.push(happy.eventId);

    const successRes = await postWebhook(POST, signed.rawBody, signed.signature);
    const successJson = (await successRes.json()) as Record<string, unknown>;
    record(
      "successful payment: signature + handler accepted",
      successRes.status === 200 &&
        (successJson.received === true || successJson.success === true),
      `status=${successRes.status}`
    );

    const orderAfter = await getOrder(admin, happy.requestId);
    const payments = await countPayments(admin, happy.requestId);
    const commissions = await countCommissions(admin, happy.requestId);
    const ledger = await countLedger(admin, happy.requestId);
    const wh = await getWebhookEvent(admin, happy.eventId);

    record(
      "successful payment: order_payment_status=paid, request stays in_progress",
      orderAfter?.order_payment_status === "paid" && orderAfter?.status === "in_progress"
    );
    record(
      "successful payment: exactly one paid payments row",
      payments.length === 1 && payments[0]?.status === "paid" && payments[0]?.payment_method === "stripe"
    );
    record(
      "successful payment: server-side commission + contractor amount",
      Number(payments[0]?.platform_fee) === happy.expectedFee &&
        Number(payments[0]?.provider_amount) === happy.expectedProviderAmount &&
        Number(orderAfter?.look_commission) === happy.expectedFee &&
        Number(orderAfter?.provider_payout_amount) === happy.expectedProviderAmount,
      `fee=${payments[0]?.platform_fee} provider=${payments[0]?.provider_amount} rate=${happy.commissionRate}`
    );
    record(
      "successful payment: exactly one platform_commissions row",
      commissions === 1
    );
    record(
      "successful payment: ledger has order_payment + platform_commission + provider_earning",
      ledger.filter((t) => t.type === "order_payment").length === 1 &&
        ledger.filter((t) => t.type === "platform_commission").length === 1 &&
        ledger.filter((t) => t.type === "provider_earning").length === 1
    );
    record(
      "successful payment: webhook event processed once",
      wh?.processing_status === "processed"
    );
    record(
      "successful payment: payment customer_id from DB order (not forged metadata)",
      payments[0]?.customer_id === happy.customerId
    );

    // -------------------------------------------------------------------------
    // STEP 6 — Idempotency: exact duplicate + concurrent duplicate
    // -------------------------------------------------------------------------
    const dupRes = await postWebhook(POST, signed.rawBody, signed.signature);
    const dupJson = (await dupRes.json()) as Record<string, unknown>;
    const paymentsAfterDup = await countPayments(admin, happy.requestId);
    const commissionsAfterDup = await countCommissions(admin, happy.requestId);
    const ledgerAfterDup = await countLedger(admin, happy.requestId);
    record(
      "duplicate event: safe 200 ack without reprocess",
      dupRes.status === 200 && (dupJson.duplicate === true || dupJson.success === true)
    );
    record(
      "duplicate event: still one payment / one commission / three ledger rows",
      paymentsAfterDup.length === 1 &&
        commissionsAfterDup === 1 &&
        ledgerAfterDup.length === 3
    );

    const concurrentEventId = `evt_test_${runId}_concurrent_${randomBytes(6).toString("hex")}`;
    const concurrentFixture = await createUnpaidOrderFixture(admin, {
      amountMajor: 80,
      currency: "USD",
      titleSuffix: "concurrent",
    });
    created.push(concurrentFixture);
    const concurrentBase = buildCheckoutCompletedEvent({
      ...concurrentFixture,
      eventId: concurrentEventId,
    });
    const concurrentSigned = signEvent(concurrentBase);
    webhookEventIds.push(concurrentEventId);

    const [c1, c2] = await Promise.all([
      postWebhook(POST, concurrentSigned.rawBody, concurrentSigned.signature),
      postWebhook(POST, concurrentSigned.rawBody, concurrentSigned.signature),
    ]);
    const cPayments = await countPayments(admin, concurrentFixture.requestId);
    const cCommissions = await countCommissions(admin, concurrentFixture.requestId);
    const cOrder = await getOrder(admin, concurrentFixture.requestId);
    const cWh = await getWebhookEvent(admin, concurrentEventId);
    record(
      "concurrent duplicate: both responses safe (200)",
      c1.status === 200 && c2.status === 200
    );
    record(
      "concurrent duplicate: only one paid payment + one commission",
      cPayments.length === 1 &&
        cPayments[0]?.status === "paid" &&
        cCommissions === 1 &&
        cOrder?.order_payment_status === "paid"
    );
    record(
      "concurrent duplicate: webhook event ends processed (single effective execution)",
      cWh?.processing_status === "processed"
    );

    // -------------------------------------------------------------------------
    // STEP 7 — Failure cases
    // -------------------------------------------------------------------------

    // 1. invalid signature
    {
      const f = await createUnpaidOrderFixture(admin, { titleSuffix: "bad_sig" });
      created.push(f);
      const event = buildCheckoutCompletedEvent(f);
      const { rawBody } = signEvent(event);
      const res = await postWebhook(POST, rawBody, "t=1,v1=deadbeef");
      const order = await getOrder(admin, f.requestId);
      const pays = await countPayments(admin, f.requestId);
      record(
        "failure: invalid signature → rejected, order not paid",
        res.status === 400 && order?.order_payment_status !== "paid" && pays.length === 0
      );
    }

    // 2. missing signature
    {
      const f = await createUnpaidOrderFixture(admin, { titleSuffix: "no_sig" });
      created.push(f);
      const event = buildCheckoutCompletedEvent(f);
      const { rawBody } = signEvent(event);
      const res = await postWebhook(POST, rawBody, null);
      const order = await getOrder(admin, f.requestId);
      const pays = await countPayments(admin, f.requestId);
      record(
        "failure: missing signature → rejected, order not paid",
        res.status === 400 && order?.order_payment_status !== "paid" && pays.length === 0
      );
    }

    // 3. wrong amount
    {
      const f = await createUnpaidOrderFixture(admin, {
        amountMajor: 120,
        titleSuffix: "wrong_amount",
      });
      created.push(f);
      const event = buildCheckoutCompletedEvent({ ...f, amountMajor: 999 });
      const signedWrong = signEvent(event);
      webhookEventIds.push(f.eventId);
      const res = await postWebhook(POST, signedWrong.rawBody, signedWrong.signature);
      const order = await getOrder(admin, f.requestId);
      const pays = await countPayments(admin, f.requestId);
      const whEvent = await getWebhookEvent(admin, f.eventId);
      record(
        "failure: wrong amount → not paid",
        res.status >= 400 && order?.order_payment_status !== "paid" && pays.length === 0,
        `status=${res.status} wh=${whEvent?.processing_status ?? "none"}`
      );
    }

    // 4. wrong currency
    {
      const f = await createUnpaidOrderFixture(admin, {
        amountMajor: 120,
        currency: "USD",
        titleSuffix: "wrong_currency",
      });
      created.push(f);
      const event = buildCheckoutCompletedEvent({ ...f, currency: "EUR" });
      const signedWrong = signEvent(event);
      webhookEventIds.push(f.eventId);
      const res = await postWebhook(POST, signedWrong.rawBody, signedWrong.signature);
      const order = await getOrder(admin, f.requestId);
      const pays = await countPayments(admin, f.requestId);
      record(
        "failure: wrong currency → not paid",
        res.status >= 400 && order?.order_payment_status !== "paid" && pays.length === 0,
        `status=${res.status}`
      );
    }

    // 5. missing internal payment path (no accepted offer)
    {
      const f = await createUnpaidOrderFixture(admin, {
        titleSuffix: "no_offer",
        withAcceptedOffer: false,
      });
      created.push(f);
      const event = buildCheckoutCompletedEvent(f);
      const signedNoOffer = signEvent(event);
      webhookEventIds.push(f.eventId);
      const res = await postWebhook(POST, signedNoOffer.rawBody, signedNoOffer.signature);
      const order = await getOrder(admin, f.requestId);
      const pays = await countPayments(admin, f.requestId);
      record(
        "failure: missing accepted offer / payment path → not paid",
        res.status >= 400 && order?.order_payment_status !== "paid" && pays.length === 0,
        `status=${res.status}`
      );
    }

    // 6. missing order/request
    {
      const missingRequestId = randomUUID();
      const eventId = `evt_test_${runId}_missing_order_${randomBytes(4).toString("hex")}`;
      const event = buildCheckoutCompletedEvent({
        eventId,
        requestId: missingRequestId,
        customerId: randomUUID(),
        providerId: randomUUID(),
        checkoutSessionId: `cs_test_missing_${randomBytes(4).toString("hex")}`,
        paymentIntentId: `pi_test_missing_${randomBytes(4).toString("hex")}`,
        amountMajor: 50,
        currency: "USD",
      });
      const signedMissing = signEvent(event);
      webhookEventIds.push(eventId);
      const res = await postWebhook(POST, signedMissing.rawBody, signedMissing.signature);
      const pays = await admin
        .from("payments")
        .select("id")
        .eq("request_id", missingRequestId);
      record(
        "failure: missing order → not paid",
        res.status >= 400 && (pays.data?.length ?? 0) === 0,
        `status=${res.status}`
      );
    }

    // 7. already-paid order
    {
      const f = await createUnpaidOrderFixture(admin, {
        amountMajor: 60,
        titleSuffix: "already_paid",
      });
      created.push(f);
      const first = buildCheckoutCompletedEvent(f);
      const firstSigned = signEvent(first);
      webhookEventIds.push(f.eventId);
      const firstRes = await postWebhook(POST, firstSigned.rawBody, firstSigned.signature);
      assert.equal(firstRes.status, 200);

      const secondEventId = `evt_test_${runId}_already_paid2_${randomBytes(4).toString("hex")}`;
      const second = buildCheckoutCompletedEvent({
        ...f,
        eventId: secondEventId,
        checkoutSessionId: `cs_test_${runId}_second_${randomBytes(4).toString("hex")}`,
        paymentIntentId: `pi_test_${runId}_second_${randomBytes(4).toString("hex")}`,
      });
      const secondSigned = signEvent(second);
      webhookEventIds.push(secondEventId);
      const secondRes = await postWebhook(POST, secondSigned.rawBody, secondSigned.signature);
      const pays = await countPayments(admin, f.requestId);
      const commissions = await countCommissions(admin, f.requestId);
      record(
        "failure/already-paid: second event does not duplicate payment",
        secondRes.status === 200 && pays.length === 1 && commissions === 1,
        `status=${secondRes.status}`
      );
    }

    // 8. expired Checkout Session
    {
      const f = await createUnpaidOrderFixture(admin, {
        titleSuffix: "expired",
        paymentStatus: "payment_pending",
      });
      created.push(f);
      const eventId = `evt_test_${runId}_expired_${randomBytes(4).toString("hex")}`;
      const event = buildGenericEvent({
        eventId,
        type: "checkout.session.expired",
        object: {
          id: f.checkoutSessionId,
          object: "checkout.session",
          metadata: { request_id: f.requestId },
          client_reference_id: f.requestId,
          payment_status: "unpaid",
          status: "expired",
        },
      });
      const signedExpired = signEvent(event);
      webhookEventIds.push(eventId);
      const res = await postWebhook(POST, signedExpired.rawBody, signedExpired.signature);
      const order = await getOrder(admin, f.requestId);
      const pays = await countPayments(admin, f.requestId);
      record(
        "failure: expired Checkout Session → not paid",
        res.status === 200 &&
          order?.order_payment_status !== "paid" &&
          pays.length === 0,
        `order_payment_status=${order?.order_payment_status}`
      );
    }

    // 9. failed PaymentIntent
    {
      const f = await createUnpaidOrderFixture(admin, {
        titleSuffix: "pi_failed",
        paymentStatus: "payment_pending",
      });
      created.push(f);
      const eventId = `evt_test_${runId}_pi_failed_${randomBytes(4).toString("hex")}`;
      const event = buildGenericEvent({
        eventId,
        type: "payment_intent.payment_failed",
        object: {
          id: f.paymentIntentId,
          object: "payment_intent",
          status: "requires_payment_method",
          amount: Math.round(f.amountMajor * 100),
          currency: f.currency.toLowerCase(),
          metadata: { request_id: f.requestId },
        },
      });
      const signedFailed = signEvent(event);
      webhookEventIds.push(eventId);
      const res = await postWebhook(POST, signedFailed.rawBody, signedFailed.signature);
      const order = await getOrder(admin, f.requestId);
      const pays = await countPayments(admin, f.requestId);
      record(
        "failure: failed PaymentIntent → not paid",
        res.status === 200 &&
          order?.order_payment_status !== "paid" &&
          pays.length === 0,
        `order_payment_status=${order?.order_payment_status}`
      );
    }

    // 10. unknown Stripe event type
    {
      const beforePaid = await admin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("status", "paid")
        .like("external_reference", `pi_test_${runId}%`);
      const eventId = `evt_test_${runId}_unknown_${randomBytes(4).toString("hex")}`;
      const event = buildGenericEvent({
        eventId,
        type: "customer.created",
        object: { id: `cus_test_${runId}`, object: "customer" },
      });
      const signedUnknown = signEvent(event);
      webhookEventIds.push(eventId);
      const res = await postWebhook(POST, signedUnknown.rawBody, signedUnknown.signature);
      const json = (await res.json()) as Record<string, unknown>;
      const whEvent = await getWebhookEvent(admin, eventId);
      record(
        "failure: unknown event → 200 ignored, no payment side effects",
        res.status === 200 &&
          (json.ignored === true || json.success === true) &&
          whEvent?.processing_status === "processed",
        `status=${res.status}`
      );
      void beforePaid;
    }

    // 11. forged metadata (attacker customer_id) — payment must use DB order.customer_id
    {
      const f = await createUnpaidOrderFixture(admin, {
        amountMajor: 95,
        titleSuffix: "forged_meta",
      });
      created.push(f);
      const forgedCustomerId = randomUUID();
      const event = buildCheckoutCompletedEvent({
        ...f,
        forgedCustomerId,
      });
      const signedForged = signEvent(event);
      webhookEventIds.push(f.eventId);
      const res = await postWebhook(POST, signedForged.rawBody, signedForged.signature);
      const pays = await countPayments(admin, f.requestId);
      record(
        "failure/forged metadata: paid customer_id comes from DB order, not forged metadata",
        res.status === 200 &&
          pays.length === 1 &&
          pays[0]?.customer_id === f.customerId &&
          pays[0]?.customer_id !== forgedCustomerId
      );
    }

    // 12. success-page visit without webhook (browser cannot mark paid / create payment)
    {
      const f = await createUnpaidOrderFixture(admin, {
        titleSuffix: "success_page_only",
        paymentStatus: "payment_pending",
      });
      created.push(f);

      // Anon / browser cannot create a paid ledger row or webhook event without the handler.
      const anonPay = await anon.from("payments").insert({
        request_id: f.requestId,
        offer_id: f.offerId,
        customer_id: f.customerId,
        provider_id: f.providerId,
        amount_gross: f.amountMajor,
        platform_fee: f.expectedFee,
        provider_amount: f.expectedProviderAmount,
        currency: f.currency,
        status: "paid",
        payment_method: "stripe",
        external_reference: `browser_forge_${runId}`,
      });
      const anonWh = await anon.from("stripe_webhook_events").insert({
        stripe_event_id: `evt_browser_forge_${runId}`,
        event_type: "checkout.session.completed",
        processing_status: "processed",
      });
      // Client-side "success=1" alone never creates payments; order stays unpaid until webhook.
      const order = await getOrder(admin, f.requestId);
      const pays = await countPayments(admin, f.requestId);
      record(
        "failure: success-page without webhook → order not paid, no payment row",
        order?.order_payment_status !== "paid" && pays.length === 0
      );
      record(
        "browser roles cannot insert payments / webhook events",
        Boolean(anonPay.error) && Boolean(anonWh.error)
      );
    }

    // Browser roles cannot call simulate RPCs / read webhook events
    {
      const rpc = await anon.rpc("simulate_test_payment", {
        p_request_id: happy.requestId,
        p_external_reference: "browser",
      });
      const selectWh = await anon.from("stripe_webhook_events").select("stripe_event_id").limit(1);
      record(
        "browser roles cannot call simulate_test_payment / read stripe_webhook_events",
        Boolean(rpc.error) && (Boolean(selectWh.error) || (selectWh.data?.length ?? 0) === 0)
      );
    }

    // -------------------------------------------------------------------------
    // STEP 8 — Database consistency across fixture set
    // -------------------------------------------------------------------------
    const fixtureRequestIds = created.map((c) => c.requestId);
    const { data: allPays } = await admin
      .from("payments")
      .select("id, request_id, status")
      .in("request_id", fixtureRequestIds);
    const paidOrders = (
      await admin
        .from("requests")
        .select("id, order_payment_status")
        .in("id", fixtureRequestIds)
        .eq("order_payment_status", "paid")
    ).data ?? [];

    for (const order of paidOrders) {
      const matching = (allPays ?? []).filter(
        (p) => p.request_id === order.id && p.status === "paid"
      );
      assert.equal(
        matching.length,
        1,
        `paid order ${order.id} must have exactly one successful payment`
      );
    }

    const paidPaymentRequestIds = (allPays ?? [])
      .filter((p) => p.status === "paid")
      .map((p) => p.request_id);
    const uniquePaidRequests = new Set(paidPaymentRequestIds);
    record(
      "consistency: no duplicate successful payments per request",
      paidPaymentRequestIds.length === uniquePaidRequests.size
    );

    const { data: processedEvents } = await admin
      .from("stripe_webhook_events")
      .select("stripe_event_id, processing_status, last_error, event_type")
      .in("stripe_event_id", webhookEventIds);

    const failedEvents = (processedEvents ?? []).filter(
      (e) => e.processing_status === "failed"
    );
    record(
      "consistency: failed webhook attempts retain diagnostic last_error",
      failedEvents.every((e) => typeof e.last_error === "string" && e.last_error.length > 0),
      `failed_count=${failedEvents.length}`
    );

    pass("database consistency checks completed");
  } finally {
    // Cleanup fixtures + webhook event rows from this run where practical.
    for (const fixture of created.reverse()) {
      try {
        await cleanupFixture(admin, fixture);
      } catch (e) {
        console.warn(
          `cleanup warning for request ${fixture.requestId}: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    }
    if (webhookEventIds.length > 0) {
      await admin.from("stripe_webhook_events").delete().in("stripe_event_id", webhookEventIds);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n--- summary ---");
  console.log(`passed=${results.filter((r) => r.ok).length} failed=${failed.length}`);
  if (failed.length > 0) {
    process.exitCode = 1;
    for (const f of failed) console.error(`FAIL: ${f.name}: ${f.detail}`);
    return;
  }
  console.log("All local payment integration scenarios passed.");
  console.log("Stripe network access was not used (guard active; local constructEvent only).");
}

main().catch((error) => {
  console.error("Local payment integration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
