/**
 * Payment checkout lookup regression: missing 028 columns must not 404 a valid order.
 * Run: npm run test:payment-checkout-lookup
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHECKOUT_ORDER_CORE_SELECT,
  isMissingColumnError,
} from "../src/lib/payments/load-order-for-checkout.ts";
import { authorizeTestOrderPayment } from "../src/lib/payments/test-payment-authorization.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

const checkoutRoute = readFileSync(
  resolve(root, "src/app/api/finance/payments/[id]/checkout/route.ts"),
  "utf8"
);
const paymentPage = readFileSync(
  resolve(root, "src/app/requests/[id]/payment/page.tsx"),
  "utf8"
);
const paymentScreen = readFileSync(
  resolve(root, "src/components/finance/OrderPaymentScreen.tsx"),
  "utf8"
);
const persistLib = readFileSync(
  resolve(root, "src/lib/payments/stripe-order-payment.ts"),
  "utf8"
);
const en = readFileSync(resolve(root, "src/lib/i18n/locales/en.ts"), "utf8");
const ru = readFileSync(resolve(root, "src/lib/i18n/locales/ru.ts"), "utf8");
const m072 = readFileSync(
  resolve(root, "supabase/migrations/072_unassign_selected_provider.sql"),
  "utf8"
);
const m073 = readFileSync(
  resolve(root, "supabase/migrations/073_provider_withdraw_decline.sql"),
  "utf8"
);
const m068 = readFileSync(
  resolve(root, "supabase/migrations/068_prod_safe_test_payments.sql"),
  "utf8"
);

test("1. Valid selected unpaid order: payment page requires in_progress + accepted offer", () => {
  assert.match(paymentPage, /request\.status !== "in_progress"/);
  assert.match(paymentPage, /\.eq\("status", "accepted"\)/);
  assert.match(paymentPage, /grossAmount = Number\(offer\.price\)/);
  assert.match(paymentPage, /OrderPaymentScreen/);
});

test("2. Checkout lookup uses canonical request row, not 028 columns as required", () => {
  assert.match(checkoutRoute, /loadOrderForCheckout/);
  assert.doesNotMatch(CHECKOUT_ORDER_CORE_SELECT, /stripe_checkout_session_id/);
  assert.doesNotMatch(CHECKOUT_ORDER_CORE_SELECT, /stripe_checkout_attempt/);
  assert.match(CHECKOUT_ORDER_CORE_SELECT, /customer_id/);
  assert.match(CHECKOUT_ORDER_CORE_SELECT, /status/);
  assert.match(checkoutRoute, /status !== "in_progress"/);
});

test("3. Amount source is accepted offer, not requests.order_amount", () => {
  assert.match(checkoutRoute, /Authoritative amount\/currency: accepted offer only/);
  assert.match(checkoutRoute, /Number\(offer\.price\)/);
  assert.match(paymentScreen, /calculatePaymentSplit\(grossAmount/);
});

test("4. Customer ownership enforced", () => {
  assert.match(checkoutRoute, /order\.customer_id !== auth\.user\.id/);
  assert.match(checkoutRoute, /Not authorized/);
  const denied = authorizeTestOrderPayment({
    authenticatedUserId: "customer-a",
    orderCustomerId: "customer-b",
    orderStatus: "in_progress",
    orderPaymentStatus: "unpaid",
    existingPaymentStatus: null,
    expectedGrossAmount: 1000,
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.status, 403);
});

test("5. Cancelled/completed cannot be paid", () => {
  const cancelled = authorizeTestOrderPayment({
    authenticatedUserId: "c1",
    orderCustomerId: "c1",
    orderStatus: "cancelled",
    orderPaymentStatus: "unpaid",
    existingPaymentStatus: null,
    expectedGrossAmount: 1000,
  });
  assert.equal(cancelled.ok, false);

  const completed = authorizeTestOrderPayment({
    authenticatedUserId: "c1",
    orderCustomerId: "c1",
    orderStatus: "completed",
    orderPaymentStatus: "completed",
    existingPaymentStatus: "paid",
    expectedGrossAmount: 1000,
  });
  assert.equal(completed.ok, false);
  assert.match(checkoutRoute, /Order is already paid/);
});

test("6. No duplicate payment (already paid is rejected)", () => {
  const dup = authorizeTestOrderPayment({
    authenticatedUserId: "c1",
    orderCustomerId: "c1",
    orderStatus: "in_progress",
    orderPaymentStatus: "paid",
    existingPaymentStatus: "paid",
    expectedGrossAmount: 1000,
  });
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.match(dup.error, /already paid/i);
});

test("7. 072/073 do not change payment checkout lookup", () => {
  assert.doesNotMatch(m072, /simulate_prod_safe|createOrderCheckoutSession|checkout/);
  assert.doesNotMatch(m073, /simulate_prod_safe|createOrderCheckoutSession|checkout/);
  assert.match(m072, /unassign_selected_provider/);
  assert.match(m073, /provider_withdraw_offer/);
});

test("8. Existing test payment flow (068) still owner + in_progress", () => {
  assert.match(m068, /simulate_prod_safe_test_payment/);
  assert.match(m068, /in_progress/);
  assert.match(m068, /customer_id/);
});

test("Missing 028 column error is not treated as Request not found", () => {
  assert.equal(
    isMissingColumnError({
      code: "PGRST204",
      message: "Could not find the 'stripe_checkout_session_id' column of 'requests' in the schema cache",
    }),
    true
  );
  assert.equal(
    isMissingColumnError({
      code: "42703",
      message: 'column requests.stripe_checkout_session_id does not exist',
    }),
    true
  );
  assert.equal(isMissingColumnError({ message: "Request not found" }), false);
  assert.match(checkoutRoute, /kind === "schema"/);
  assert.match(persistLib, /isMissingColumnError/);
});

test("Normal unpaid order hides raw Stripe-not-configured copy", () => {
  assert.match(paymentScreen, /onlinePayUnavailableTitle/);
  assert.match(paymentScreen, /livePayUnavailable/);
  assert.match(paymentScreen, /isStripeConfigUserError/);
  assert.match(paymentScreen, /data-testid="online-pay-unavailable"/);
  assert.match(en, /Online payment is not available yet/);
  assert.match(ru, /Онлайн-оплата пока недоступна/);
  assert.match(checkoutRoute, /code: "stripe_not_configured"/);
  assert.match(checkoutRoute, /Stripe is not configured/);
  assert.match(paymentScreen, /complete-test-payment/);
});

console.log(`\n${passed} payment-checkout-lookup tests passed.`);
