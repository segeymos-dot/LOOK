/**
 * Stripe webhook + payment confirmation security tests.
 * Mocks / fixtures only — no Stripe live mode, no charges, no remote DB writes.
 *
 * Run: npm run test:stripe-webhook-security
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertStripeSessionMatchesOrder,
  resolveStripeRequestId,
  verifyStripeAmountAndCurrency,
} from "../src/lib/payments/stripe-payment-verify.ts";
import {
  ackDuplicateEvent,
  ackIgnoredEvent,
  classifyStripeWebhookEvent,
  decideStripeWebhookClaim,
  safeWebhookErrorMessage,
  shouldConfirmCheckoutSession,
} from "../src/lib/payments/stripe-webhook-routing.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

function read(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

// --- 1–2. Signature verification (source + behavior contract) ---

test("1. missing Stripe signature → rejected (route contract)", () => {
  const route = read("src/app/api/webhooks/stripe/route.ts");
  assert.match(route, /Missing stripe-signature/);
  assert.match(route, /status:\s*400/);
  assert.match(route, /request\.headers\.get\("stripe-signature"\)/);
  assert.match(route, /await request\.text\(\)/);
  assert.match(route, /constructEvent\(rawBody,\s*signature,\s*webhookSecret\)/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_.*WEBHOOK/);
  assert.match(route, /getStripeWebhookSecret|STRIPE_WEBHOOK_SECRET/);
});

test("2. invalid signature → rejected without trusting body", () => {
  const route = read("src/app/api/webhooks/stripe/route.ts");
  assert.match(route, /Invalid Stripe signature/);
  assert.match(route, /stripe\.webhooks\.constructEvent\(rawBody,\s*signature,\s*webhookSecret\)/);
  // Must verify before any claim / confirm side effects (ignore import lines).
  const bodyStart = route.indexOf("export async function POST");
  const constructIdx = route.indexOf("stripe.webhooks.constructEvent", bodyStart);
  const claimIdx = route.indexOf("await claimStripeWebhookEvent", bodyStart);
  assert.ok(constructIdx > 0 && claimIdx > constructIdx, "claim must run after constructEvent");
  assert.doesNotMatch(route, /JSON\.parse\(rawBody\)/);
  assert.doesNotMatch(route, /JSON\.stringify\(.*constructEvent/);
});

// --- Claim / idempotency decisions ---

test("3. valid new event claim → process once", () => {
  const d = decideStripeWebhookClaim("claimed");
  assert.equal(d.action, "process");
});

test("4. duplicate processed event → 200 ack, no reprocess", () => {
  const d = decideStripeWebhookClaim("already_processed");
  assert.equal(d.action, "ack");
  const http = ackDuplicateEvent(d.reason);
  assert.equal(http.status, 200);
  assert.equal(http.body.duplicate, true);
});

test("5. concurrent duplicate (already_processing) → 200, no duplicate state change", () => {
  const d = decideStripeWebhookClaim("already_processing");
  assert.equal(d.action, "ack");
  assert.equal(ackDuplicateEvent(d.reason).status, 200);
});

test("6. mismatched amount → no success", () => {
  const result = verifyStripeAmountAndCurrency({
    stripeAmountMinor: 9999,
    stripeCurrency: "usd",
    expectedAmountMajor: 100,
    expectedCurrency: "usd",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /amount/i);
});

test("7. mismatched currency → no success", () => {
  const result = verifyStripeAmountAndCurrency({
    stripeAmountMinor: 10000,
    stripeCurrency: "eur",
    expectedAmountMajor: 100,
    expectedCurrency: "usd",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /currency/i);
});

test("8. missing internal order identifiers → safe failure helpers", () => {
  assert.equal(resolveStripeRequestId({}), null);
  assert.equal(
    resolveStripeRequestId({ metadataRequestId: null, clientReferenceId: "  " }),
    null
  );
  const mismatch = assertStripeSessionMatchesOrder("other-order", "order-1");
  assert.equal(mismatch.ok, false);
});

test("9. already-paid / amount match path documented in confirm RPC", () => {
  const migration = read("supabase/migrations/028_stripe_webhook_idempotency.sql");
  assert.match(migration, /already_paid/);
  assert.match(migration, /Stripe amount does not match expected order amount/);
  assert.match(migration, /unique_violation/);
});

test("10. unknown event → 200 with no payment confirm", () => {
  assert.equal(classifyStripeWebhookEvent("customer.created"), "ignored");
  const http = ackIgnoredEvent("customer.created");
  assert.equal(http.status, 200);
  assert.equal(http.body.ignored, true);

  const route = read("src/app/api/webhooks/stripe/route.ts");
  assert.match(route, /ackIgnoredEvent/);
  assert.doesNotMatch(
    route.split("case \"ignored\"")[1]?.slice(0, 400) ?? "",
    /confirmFromCheckoutSession/
  );
});

test("11. successful checkout.session.completed is authoritative", () => {
  assert.equal(
    classifyStripeWebhookEvent("checkout.session.completed"),
    "checkout_session_completed"
  );
  assert.equal(
    classifyStripeWebhookEvent("payment_intent.succeeded"),
    "payment_intent_succeeded_supplementary"
  );
  assert.equal(
    shouldConfirmCheckoutSession({ payment_status: "paid", status: "complete" }),
    true
  );
  assert.equal(
    shouldConfirmCheckoutSession({ payment_status: "unpaid", status: "open" }),
    false
  );

  const matched = verifyStripeAmountAndCurrency({
    stripeAmountMinor: 15050,
    stripeCurrency: "usd",
    expectedAmountMajor: 150.5,
    expectedCurrency: "USD",
  });
  assert.equal(matched.ok, true);

  const route = read("src/app/api/webhooks/stripe/route.ts");
  assert.match(route, /Authoritative success event/);
  assert.match(route, /checkout\.session\.completed/);
});

test("12. failed processing → event marked failed; retry claim allowed", () => {
  const migration = read("supabase/migrations/028_stripe_webhook_idempotency.sql");
  assert.match(migration, /fail_stripe_webhook_event/);
  assert.match(migration, /processing_status = 'failed'/);
  assert.match(migration, /RETURN 'retried'/);

  const d = decideStripeWebhookClaim("retried");
  assert.equal(d.action, "process");

  const route = read("src/app/api/webhooks/stripe/route.ts");
  assert.match(route, /failStripeWebhookEvent/);
  assert.match(route, /completeStripeWebhookEvent/);

  assert.match(safeWebhookErrorMessage(new Error("x".repeat(600))), /^x{500}$/);
});

test("13. success redirect/page alone cannot mark an order paid", () => {
  const screen = read("src/components/finance/OrderPaymentScreen.tsx");
  assert.match(screen, /Redirect query params alone never mark the order paid/);
  assert.match(screen, /confirmStripeSession\(sessionId\)/);
  // Must not set paid from success=1 without awaiting confirm.
  assert.doesNotMatch(
    screen,
    /if \(success === "1"\)[\s\S]{0,80}setLocalOrderPaymentStatus\("paid"\)/
  );

  const confirm = read("src/app/api/finance/payments/[id]/confirm/route.ts");
  assert.match(confirm, /confirmStripeCheckoutSession\(sessionId,\s*requestId\)/);
  assert.match(confirm, /Does NOT trust query params/);
  assert.match(confirm, /sessionId\.startsWith\("cs_"\)/);
  // Client-supplied status is ignored.
  assert.match(confirm, /Ignore any client-supplied status/);
});

test("migration 028 creates stripe_webhook_events with browser roles revoked", () => {
  const migration = read("supabase/migrations/028_stripe_webhook_idempotency.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS stripe_webhook_events/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE stripe_webhook_events FROM anon/);
  assert.match(migration, /REVOKE ALL ON TABLE stripe_webhook_events FROM authenticated/);
  assert.match(migration, /claim_stripe_webhook_event/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION claim_stripe_webhook_event/);
  assert.match(migration, /TO service_role/);
  assert.match(migration, /stripe_checkout_session_id/);
  assert.match(migration, /stripe_payment_intent_id/);
});

test("checkout uses idempotency key and reuses open sessions", () => {
  const lib = read("src/lib/payments/stripe-order-payment.ts");
  assert.match(lib, /idempotencyKey/);
  assert.match(lib, /look_checkout_/);
  assert.match(lib, /existing\.status === "open"/);
  assert.match(lib, /provider_id/);
  assert.match(lib, /verifyStripeAmountAndCurrency/);
});

test("confirm RPC requires Stripe amount/currency match server expectation", () => {
  const migration = read("supabase/migrations/028_stripe_webhook_idempotency.sql");
  assert.match(migration, /Stripe amount is required/);
  assert.match(migration, /Stripe currency is required/);
  assert.match(migration, /v_gross := v_expected_gross/);
  assert.doesNotMatch(
    migration,
    /v_gross := ROUND\(COALESCE\(p_amount_received,\s*v_offer\.price\)/
  );
});

console.log(`\n${passed} stripe-webhook-security tests passed.`);
