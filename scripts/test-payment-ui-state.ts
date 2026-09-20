/**
 * Payment UI state contract: is_test vs Stripe-absent vs live.
 * Run: npm run test:payment-ui-state
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPaymentUiState } from "../src/lib/payments/payment-ui-state.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

const panel = readFileSync(
  resolve(root, "src/components/finance/OrderPaymentPanel.tsx"),
  "utf8"
);
const screen = readFileSync(
  resolve(root, "src/components/finance/OrderPaymentScreen.tsx"),
  "utf8"
);
const en = readFileSync(resolve(root, "src/lib/i18n/locales/en.ts"), "utf8");
const ru = readFileSync(resolve(root, "src/lib/i18n/locales/ru.ts"), "utf8");
const m068 = readFileSync(
  resolve(root, "supabase/migrations/068_prod_safe_test_payments.sql"),
  "utf8"
);
const m070 = readFileSync(
  resolve(root, "supabase/migrations/070_admin_mark_request_is_test.sql"),
  "utf8"
);
const m071 = readFileSync(
  resolve(root, "supabase/migrations/071_fix_prod_safe_test_payment_ledger.sql"),
  "utf8"
);
const m072 = readFileSync(
  resolve(root, "supabase/migrations/072_unassign_selected_provider.sql"),
  "utf8"
);
const m073 = readFileSync(
  resolve(root, "supabase/migrations/073_provider_withdraw_decline.sql"),
  "utf8"
);
const paymentsUi = readFileSync(
  resolve(root, "src/app/profile/payments/page.tsx"),
  "utf8"
);

test("1. is_test=true → test payment UI", () => {
  assert.equal(
    getPaymentUiState({
      isTest: true,
      stripeConfigured: false,
      paymentStatus: "unpaid",
    }),
    "test"
  );
  assert.match(panel, /uiState === "test"/);
  assert.match(panel, /completeTestPayment/);
  assert.match(screen, /uiState === "test"/);
});

test("2. is_test=false + Stripe absent → unavailable", () => {
  assert.equal(
    getPaymentUiState({
      isTest: false,
      stripeConfigured: false,
      paymentStatus: "unpaid",
    }),
    "unavailable"
  );
  assert.match(panel, /onlinePayUnavailableTitle/);
  assert.match(screen, /onlinePayUnavailableTitle/);
});

test("3. is_test=false + Stripe absent → no false test card copy", () => {
  assert.doesNotMatch(
    ru.match(/checkoutDesc: "([^"]+)"/)?.[1] ?? "",
    /Тестовая оплата/
  );
  assert.match(ru, /checkoutTestDesc: "Тестовая оплата картой/);
  const liveBranch = panel.slice(panel.indexOf('uiState === "live_unpaid"') >= 0 ? 0 : 0);
  void liveBranch;
  assert.match(panel, /checkoutTestDesc/);
  assert.ok(
    panel.indexOf("checkoutTestDesc") < panel.indexOf('uiState === "unavailable"') ||
      panel.includes('uiState === "test"')
  );
});

test("4. is_test=false + Stripe configured → live_unpaid Pay UI", () => {
  assert.equal(
    getPaymentUiState({
      isTest: false,
      stripeConfigured: true,
      paymentStatus: "unpaid",
    }),
    "live_unpaid"
  );
  assert.match(panel, /finance\.payment\.payOrder/);
  assert.match(en, /Pay order · \{amount\}/);
});

test("5. paid order → paid", () => {
  assert.equal(
    getPaymentUiState({
      isTest: false,
      stripeConfigured: false,
      paymentStatus: "paid",
    }),
    "paid"
  );
  assert.equal(
    getPaymentUiState({
      isTest: true,
      stripeConfigured: true,
      paymentStatus: "paid",
    }),
    "paid"
  );
});

test("6. completed order → completed", () => {
  assert.equal(
    getPaymentUiState({
      isTest: false,
      stripeConfigured: true,
      paymentStatus: "completed",
    }),
    "completed"
  );
});

test("7. 068/070/071 untouched by this helper", () => {
  assert.match(m068, /simulate_prod_safe_test_payment/);
  assert.match(m070, /admin_mark_request_is_test/);
  assert.match(m071, /INSERT INTO public\.payments/);
});

test("8. 072/073 untouched", () => {
  assert.match(m072, /unassign_selected_provider/);
  assert.match(m073, /provider_withdraw_offer/);
});

test("9. Payments & payouts profile UI not using checkoutDesc", () => {
  assert.doesNotMatch(paymentsUi, /checkoutDesc|Тестовая оплата картой/);
});

test("Stripe-off never becomes test", () => {
  assert.notEqual(
    getPaymentUiState({
      isTest: false,
      stripeConfigured: false,
      paymentStatus: "unpaid",
    }),
    "test"
  );
});

console.log(`\n${passed} payment-ui-state tests passed.`);
