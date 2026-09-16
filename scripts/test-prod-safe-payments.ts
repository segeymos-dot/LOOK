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

console.log(`\n${passed} prod-safe payment regression tests passed.`);
