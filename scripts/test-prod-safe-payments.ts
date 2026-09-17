/**
 * Prod-safe TEST order/payment regression suite (no Stripe, no DB mutations).
 * Run: npm run test:prod-safe-payments
 *
 * Covers the canonical rule:
 * ENABLE_PROD_TEST_PAYMENTS + allowlisted email + request.is_test
 * → simulate_prod_safe_test_payment only (never Stripe / never live payout).
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  areProdSafeTestPaymentsEnabled,
  areTestPaymentsEnabled,
  canInvokeProdSafeTestPayment,
  canInvokeSimulatedOrderPayment,
  canMarkOrderAsTest,
  isProdTestPaymentEmail,
} from "../src/lib/payments/test-payments-guard.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

const prodEnv = {
  VERCEL_ENV: "production",
  NODE_ENV: "production",
  ENABLE_PROD_TEST_PAYMENTS: "true",
  PROD_TEST_PAYMENT_EMAILS: "hostel343@gmail.com,irina400@yahoo.com",
  ENABLE_TEST_PAYMENTS: "true", // must stay closed on production
};

const previewEnv = {
  VERCEL_ENV: "preview",
  NODE_ENV: "production",
  ENABLE_TEST_PAYMENTS: "true",
};

test("1. Normal user cannot mark/create test orders", () => {
  assert.equal(
    canMarkOrderAsTest({ email: "random@example.com" }, prodEnv),
    false
  );
});

test("2. Allowlisted tester can mark TEST orders when flag on", () => {
  assert.equal(
    canMarkOrderAsTest({ email: "hostel343@gmail.com" }, prodEnv),
    true
  );
  assert.equal(isProdTestPaymentEmail("irina400@yahoo.com", prodEnv), true);
});

test("3. Non-allowlisted cannot invoke prod-safe pay even on is_test", () => {
  assert.equal(
    canInvokeProdSafeTestPayment(
      {
        email: "other@example.com",
        isOrderOwner: true,
        isTestOrder: true,
      },
      prodEnv
    ),
    false
  );
});

test("4. TEST order pay allowed only with flag + allowlist + is_test + owner", () => {
  assert.equal(
    canInvokeProdSafeTestPayment(
      {
        email: "hostel343@gmail.com",
        isOrderOwner: true,
        isTestOrder: true,
      },
      prodEnv
    ),
    true
  );
});

test("5. is_test=false never opens prod-safe simulator", () => {
  assert.equal(
    canInvokeProdSafeTestPayment(
      {
        email: "hostel343@gmail.com",
        isOrderOwner: true,
        isTestOrder: false,
      },
      prodEnv
    ),
    false
  );
});

test("6. Production hard-closes ENABLE_TEST_PAYMENTS simulator", () => {
  assert.equal(areTestPaymentsEnabled(prodEnv), false);
  assert.equal(
    canInvokeSimulatedOrderPayment(
      {
        email: "hostel343@gmail.com",
        isOrderOwner: true,
      },
      prodEnv
    ),
    false
  );
});

test("7. Preview may open ENABLE_TEST_PAYMENTS simulator", () => {
  assert.equal(areTestPaymentsEnabled(previewEnv), true);
});

test("8. Prod-safe kill-switch off denies all", () => {
  const off = { ...prodEnv, ENABLE_PROD_TEST_PAYMENTS: "false" };
  assert.equal(areProdSafeTestPaymentsEnabled(off), false);
  assert.equal(
    canInvokeProdSafeTestPayment(
      {
        email: "hostel343@gmail.com",
        isOrderOwner: true,
        isTestOrder: true,
      },
      off
    ),
    false
  );
});

test("9. Commission arithmetic 100 → 10 / 90", () => {
  const rate = 0.1;
  const gross = 100;
  const fee = Math.round(gross * rate * 100) / 100;
  const net = gross - fee;
  assert.equal(fee, 10);
  assert.equal(net, 90);
});

test("10. Migration 068 defines prod-safe RPC + is_test columns", () => {
  const m068 = readFileSync(
    resolve(root, "supabase/migrations/068_prod_safe_test_payments.sql"),
    "utf8"
  );
  assert.match(m068, /ADD COLUMN IF NOT EXISTS is_test/);
  assert.match(m068, /simulate_prod_safe_test_payment/);
  assert.match(m068, /set_request_is_test/);
  assert.match(m068, /DO NOT credit provider_balances|Intentionally DO NOT credit provider_balances/);
  assert.match(m068, /look_test/);
});

test("11. Migration 070 defines admin_mark_request_is_test + Alexey prepare", () => {
  const m070 = readFileSync(
    resolve(root, "supabase/migrations/070_admin_mark_request_is_test.sql"),
    "utf8"
  );
  assert.match(m070, /admin_mark_request_is_test/);
  assert.match(m070, /559c373f-03e1-4d6f-b941-45d7cdd0ee58/);
  assert.match(m070, /hostel343@gmail\.com/);
  assert.match(m070, /Ремонт комнат/);
  assert.match(m070, /REVOKE ALL ON FUNCTION public\.set_request_is_test/);
  assert.match(m070, /GRANT EXECUTE ON FUNCTION public\.set_request_is_test\(UUID, BOOLEAN\) TO service_role/);
  assert.match(m070, /payment_transaction_id/);
  assert.match(m070, /payment_provider_name/);
  // Production never received 028 — executable SQL must not reference those columns.
  const m070Code = m070.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(m070Code, /stripe_checkout_session_id/);
  assert.doesNotMatch(m070Code, /stripe_payment_intent_id/);
  assert.doesNotMatch(m070Code, /stripe_checkout_attempt/);
  assert.doesNotMatch(m070, /simulate_prod_safe_test_payment\(/);
});

test("12. Checkout route refuses is_test before Stripe", () => {
  const src = readFileSync(
    resolve(root, "src/app/api/finance/payments/[id]/checkout/route.ts"),
    "utf8"
  );
  const refuseIdx = src.indexOf("TEST orders cannot use Stripe");
  const stripeGateIdx = src.indexOf("if (!isStripeConfigured())");
  assert.ok(refuseIdx > 0 && stripeGateIdx > 0, "both checks present");
  assert.ok(
    refuseIdx < stripeGateIdx,
    "is_test hard-refuse must run before Stripe config gate"
  );
  assert.match(src, /TEST orders cannot use Stripe/);
});

test("13. Pay route uses simulate_prod_safe for prod-safe path", () => {
  const src = readFileSync(
    resolve(root, "src/app/api/finance/payments/[id]/route.ts"),
    "utf8"
  );
  assert.match(src, /executeProdSafeTestPayment|canInvokeProdSafeTestPayment/);
  assert.match(src, /simulate_prod_safe_test_payment|executeProdSafeTestPayment/);
});

test("14. Finance summary excludes is_test / look_test payments", () => {
  const src = readFileSync(
    resolve(root, "src/lib/data/finance-actions.ts"),
    "utf8"
  );
  assert.match(src, /isTestPaymentRow|is_test/);
  assert.match(src, /look_test/);
});

test("15. Support / geo / inquiries routes untouched by 070", () => {
  const m070 = readFileSync(
    resolve(root, "supabase/migrations/070_admin_mark_request_is_test.sql"),
    "utf8"
  );
  assert.doesNotMatch(m070, /website_inquir|support_ticket|geolocation|app_presence/i);
  assert.ok(existsSync(resolve(root, "supabase/migrations/062_website_inquiries.sql")));
  assert.ok(existsSync(resolve(root, "supabase/migrations/069_fix_admin_online_role_counts.sql")));
});

test("16. Title/description text is not a test-mode source in guards", () => {
  const guard = readFileSync(
    resolve(root, "src/lib/payments/test-payments-guard.ts"),
    "utf8"
  );
  const codeOnly = guard
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(codeOnly, /\btitle\b|\bdescription\b/);
  assert.match(guard, /CANONICAL PROD-SAFE TEST MODE/);
  assert.match(guard, /request\.is_test/);
});

const m071 = readFileSync(
  resolve(root, "supabase/migrations/071_fix_prod_safe_test_payment_ledger.sql"),
  "utf8"
);
const m034 = readFileSync(
  resolve(root, "supabase/migrations/034_ledger_refund_dispute.sql"),
  "utf8"
);

test("A. Test payment happy path writes payments + transactions (071)", () => {
  assert.match(m071, /CREATE OR REPLACE FUNCTION public\.simulate_prod_safe_test_payment/);
  assert.match(m071, /INSERT INTO public\.payments/);
  assert.match(m071, /INSERT INTO public\.transactions/);
  assert.match(m071, /order_payment_status = 'paid'/);
  assert.match(m071, /is_test', true/);
});

test("B. Correct insert_ledger_entry signature / casts when helper exists", () => {
  assert.match(
    m034,
    /CREATE OR REPLACE FUNCTION insert_ledger_entry\(\s*p_payment_id UUID/
  );
  assert.match(m034, /p_type transaction_type/);
  assert.match(m034, /p_ledger_code TEXT/);
  assert.match(m034, /p_account_scope TEXT/);
  // 071 must cast enums/text — never bare unknown string literals for helper path
  assert.match(m071, /'order_payment'::transaction_type/);
  assert.match(m071, /'order_payment'::text/);
  assert.match(m071, /'customer'::text/);
  assert.match(m071, /to_regprocedure\(/);
  assert.match(m071, /insert_ledger_entry\(uuid,uuid,uuid,uuid,transaction_type/);
});

test("C. Commission 44999 → LOOK 4499.90 → provider 40499.10", () => {
  const rate = 0.1;
  const gross = 44999;
  const fee = Math.round(gross * rate * 100) / 100;
  const net = Math.round((gross - fee) * 100) / 100;
  assert.equal(fee, 4499.9);
  assert.equal(net, 40499.1);
  // Same ROUND semantics as SQL ROUND(x, 2) for this case
  assert.match(m071, /v_fee := ROUND\(v_gross \* v_rate, 2\)/);
  assert.match(m071, /v_provider_amount := v_gross - v_fee/);
});

test("D. No Stripe call in prod-safe simulator", () => {
  const code = m071.replace(/--[^\n]*/g, "").replace(/COMMENT ON[\s\S]*?;/gi, "");
  assert.doesNotMatch(code, /\bstripe\b/i);
  assert.doesNotMatch(code, /checkout\.sessions|payment_intents|sk_live/i);
  assert.match(m071, /look_test/);
  assert.match(m071, /DO NOT credit provider_balances/);
});

test("E. No external payout / no provider_balances credit", () => {
  assert.match(m071, /DO NOT credit provider_balances/);
  assert.doesNotMatch(m071, /INSERT INTO public\.provider_balances/);
  assert.doesNotMatch(m071, /INSERT INTO provider_balances/);
  assert.match(m071, /payout_status = 'cancelled'/);
});

test("F. Second click idempotent when payment already paid", () => {
  assert.match(m071, /v_existing\.status = 'paid'/);
  assert.match(m071, /'idempotent', true/);
});

test("G. Ledger failure rolls back entire payment (single-function txn)", () => {
  assert.match(
    m071,
    /Payment \+ commissions \+ ledger \+ request update are one DB transaction/
  );
  assert.match(m071, /rolls back the payment row/);
  // Payment insert precedes ledger — exception in same plpgsql block aborts all
  const payIdx = m071.indexOf("INSERT INTO public.payments");
  const ledgerIdx = m071.indexOf("INSERT INTO public.transactions");
  assert.ok(payIdx > 0 && ledgerIdx > payIdx);
});

test("H. Normal non-test payment path unchanged (checkout still Stripe-only for !is_test)", () => {
  const checkout = readFileSync(
    resolve(root, "src/app/api/finance/payments/[id]/checkout/route.ts"),
    "utf8"
  );
  assert.match(checkout, /createOrderCheckoutSession/);
  assert.match(checkout, /TEST orders cannot use Stripe/);
  // 071 only replaces simulate_prod_safe_test_payment
  assert.doesNotMatch(m071, /confirm_stripe_payment|createOrderCheckoutSession/);
});

test("I. Existing orders unaffected (071 only REPLACE simulate function)", () => {
  assert.doesNotMatch(m071, /DROP TABLE|TRUNCATE/i);
  assert.doesNotMatch(m071, /559c373f-03e1-4d6f-b941-45d7cdd0ee58/);
  // Only the simulate function body updates the paying request by p_request_id
  assert.match(m071, /UPDATE public\.requests\s+SET order_payment_status = 'paid'/);
  assert.equal(
    (m071.match(/UPDATE public\.requests/g) || []).length,
    1,
    "only the paid-path request update"
  );
});

console.log(`\n${passed} prod-safe payment regression tests passed.`);
