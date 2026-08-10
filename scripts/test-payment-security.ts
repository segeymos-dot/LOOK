/**
 * Payment security tests — no Stripe, no remote DB mutations, no migration apply.
 * Run: npm run test:payment-security
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  areTestPaymentsEnabled,
  canInvokeSimulatedOrderPayment,
  isProductionRuntime,
  isTestPaymentActor,
} from "../src/lib/payments/test-payments-guard.ts";
import {
  authorizeTestOrderPayment,
  authorizeTestPayout,
} from "../src/lib/payments/test-payment-authorization.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

test("1. missing flag → denied", () => {
  assert.equal(areTestPaymentsEnabled({}), false);
  assert.equal(areTestPaymentsEnabled({ ENABLE_TEST_PAYMENTS: undefined }), false);
});

test("2. false flag → denied", () => {
  assert.equal(areTestPaymentsEnabled({ ENABLE_TEST_PAYMENTS: "false" }), false);
  assert.equal(areTestPaymentsEnabled({ ENABLE_TEST_PAYMENTS: "0" }), false);
  assert.equal(areTestPaymentsEnabled({ ENABLE_TEST_PAYMENTS: "TRUE" }), false);
  assert.equal(areTestPaymentsEnabled({ ENABLE_TEST_PAYMENTS: "yes" }), false);
});

test("2b. trimmed true flag is accepted", () => {
  assert.equal(areTestPaymentsEnabled({ ENABLE_TEST_PAYMENTS: "true" }), true);
  assert.equal(areTestPaymentsEnabled({ ENABLE_TEST_PAYMENTS: "true\n" }), true);
  assert.equal(areTestPaymentsEnabled({ ENABLE_TEST_PAYMENTS: " true " }), true);
});

test("3. production always denied (even with true flag)", () => {
  // Local/non-Vercel: NODE_ENV=production closes the gate.
  assert.equal(isProductionRuntime({ NODE_ENV: "production" }), true);
  assert.equal(isProductionRuntime({ VERCEL_ENV: "production" }), true);
  assert.equal(
    areTestPaymentsEnabled({
      NODE_ENV: "production",
      ENABLE_TEST_PAYMENTS: "true",
    }),
    false
  );
  assert.equal(
    areTestPaymentsEnabled({
      VERCEL_ENV: "production",
      ENABLE_TEST_PAYMENTS: "true",
    }),
    false
  );
  // Vercel Production keeps denying even if NODE_ENV were non-production.
  assert.equal(
    areTestPaymentsEnabled({
      NODE_ENV: "development",
      VERCEL_ENV: "production",
      ENABLE_TEST_PAYMENTS: "true",
    }),
    false
  );
  assert.equal(
    areTestPaymentsEnabled({
      NODE_ENV: "production",
      ENABLE_TEST_PAYMENTS: "false",
    }),
    false
  );
});

test("3b. Vercel Preview may enable test payments (NODE_ENV=production is normal there)", () => {
  assert.equal(
    isProductionRuntime({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
    }),
    false
  );
  assert.equal(
    areTestPaymentsEnabled({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      ENABLE_TEST_PAYMENTS: "true",
    }),
    true
  );
  assert.equal(
    areTestPaymentsEnabled({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      ENABLE_TEST_PAYMENTS: "false",
    }),
    false
  );
});

test("4. explicit true flag + unauthenticated user → denied", () => {
  assert.equal(areTestPaymentsEnabled({ ENABLE_TEST_PAYMENTS: "true" }), true);
  const result = authorizeTestOrderPayment({
    authenticatedUserId: null,
    orderCustomerId: "cust-1",
    orderStatus: "in_progress",
    orderPaymentStatus: "unpaid",
    existingPaymentStatus: null,
    expectedGrossAmount: 100,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 401);
});

test("5. explicit true flag + unauthorized user/order → denied", () => {
  const result = authorizeTestOrderPayment({
    authenticatedUserId: "user-other",
    orderCustomerId: "cust-1",
    orderStatus: "in_progress",
    orderPaymentStatus: "unpaid",
    existingPaymentStatus: null,
    expectedGrossAmount: 100,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 403);
});

test("5b. platform admin may authorize non-owned order", () => {
  const result = authorizeTestOrderPayment({
    authenticatedUserId: "admin-1",
    orderCustomerId: "cust-1",
    orderStatus: "in_progress",
    orderPaymentStatus: "unpaid",
    existingPaymentStatus: null,
    expectedGrossAmount: 100,
    isPlatformAdmin: true,
  });
  assert.equal(result.ok, true);
});

test("6. explicit true flag + already-paid order → denied", () => {
  const byOrderStatus = authorizeTestOrderPayment({
    authenticatedUserId: "cust-1",
    orderCustomerId: "cust-1",
    orderStatus: "in_progress",
    orderPaymentStatus: "paid",
    existingPaymentStatus: null,
    expectedGrossAmount: 100,
  });
  assert.equal(byOrderStatus.ok, false);
  if (!byOrderStatus.ok) assert.equal(byOrderStatus.status, 400);

  const byPaymentRow = authorizeTestOrderPayment({
    authenticatedUserId: "cust-1",
    orderCustomerId: "cust-1",
    orderStatus: "in_progress",
    orderPaymentStatus: "unpaid",
    existingPaymentStatus: "paid",
    expectedGrossAmount: 100,
  });
  assert.equal(byPaymentRow.ok, false);
});

test("7. explicit true flag + valid authorized test scenario → allowed", () => {
  assert.equal(areTestPaymentsEnabled({ ENABLE_TEST_PAYMENTS: "true" }), true);
  const result = authorizeTestOrderPayment({
    authenticatedUserId: "cust-1",
    orderCustomerId: "cust-1",
    orderStatus: "in_progress",
    orderPaymentStatus: "unpaid",
    existingPaymentStatus: null,
    expectedGrossAmount: 150.5,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.expectedGrossAmount, 150.5);

  const payoutOk = authorizeTestPayout({
    authenticatedUserId: "prov-1",
    canActAsProvider: true,
  });
  assert.equal(payoutOk.ok, true);

  const payoutDenied = authorizeTestPayout({
    authenticatedUserId: "cust-1",
    canActAsProvider: false,
  });
  assert.equal(payoutDenied.ok, false);
});

test("7b. test payment actors are limited to test emails / admins", () => {
  assert.equal(isTestPaymentActor({ email: "customer@test.look" }), true);
  assert.equal(isTestPaymentActor({ email: "admin@test.look" }), true);
  assert.equal(isTestPaymentActor({ email: "someone@example.com" }), false);
  assert.equal(
    isTestPaymentActor({ email: "someone@example.com", isPlatformAdmin: true }),
    true
  );
});

test("7c. Preview order owner may invoke simulation; other customer / provider denied", () => {
  const previewEnv = {
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    ENABLE_TEST_PAYMENTS: "true",
  };
  assert.equal(
    canInvokeSimulatedOrderPayment(
      { email: "owner@example.com", isOrderOwner: true },
      previewEnv
    ),
    true
  );
  assert.equal(
    canInvokeSimulatedOrderPayment(
      { email: "other@example.com", isOrderOwner: false },
      previewEnv
    ),
    false
  );
  assert.equal(
    canInvokeSimulatedOrderPayment(
      { email: "provider@example.com", isOrderOwner: false },
      previewEnv
    ),
    false
  );
  assert.equal(
    canInvokeSimulatedOrderPayment(
      { email: "provider@test.look", isOrderOwner: false },
      previewEnv
    ),
    true
  );
});

test("7d. production hard-denies simulated invoke even for order owner", () => {
  assert.equal(
    canInvokeSimulatedOrderPayment(
      { email: "owner@example.com", isOrderOwner: true },
      {
        VERCEL_ENV: "production",
        ENABLE_TEST_PAYMENTS: "true",
      }
    ),
    false
  );
});

test("7e. accepted offer amount is authoritative for authz ($2500)", () => {
  const result = authorizeTestOrderPayment({
    authenticatedUserId: "cust-1",
    orderCustomerId: "cust-1",
    orderStatus: "in_progress",
    orderPaymentStatus: "unpaid",
    existingPaymentStatus: null,
    expectedGrossAmount: 2500,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.expectedGrossAmount, 2500);
});

test("7f. already-paid replay is denied (no double ledger)", () => {
  const result = authorizeTestOrderPayment({
    authenticatedUserId: "cust-1",
    orderCustomerId: "cust-1",
    orderStatus: "in_progress",
    orderPaymentStatus: "paid",
    existingPaymentStatus: "paid",
    expectedGrossAmount: 2500,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
});

test("8. migration revokes browser-role RPC execution", () => {
  const migration = readFileSync(
    resolve(root, "supabase/migrations/027_revoke_simulate_test_grants.sql"),
    "utf8"
  );

  for (const role of ["PUBLIC", "anon", "authenticated"]) {
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON FUNCTION simulate_test_payment\\(UUID, TEXT\\) FROM ${role}`),
      `missing revoke simulate_test_payment(UUID, TEXT) from ${role}`
    );
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON FUNCTION simulate_test_payment\\(UUID\\) FROM ${role}`),
      `missing revoke simulate_test_payment(UUID) from ${role}`
    );
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON FUNCTION simulate_test_payout\\(NUMERIC, UUID\\) FROM ${role}`),
      `missing revoke simulate_test_payout from ${role}`
    );
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON FUNCTION simulate_test_refund\\(UUID\\) FROM ${role}`),
      `missing revoke simulate_test_refund from ${role}`
    );
  }

  assert.match(migration, /GRANT EXECUTE ON FUNCTION simulate_test_payment\(UUID, TEXT\) TO service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION simulate_test_payout\(NUMERIC, UUID\) TO service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION simulate_test_refund\(UUID\) TO service_role/);
  assert.match(migration, /auth\.role\(\) = 'service_role'/);
});

test("8b. ledger refund migration keeps test refunds service_role-only and idempotent", () => {
  const migration = readFileSync(
    resolve(root, "supabase/migrations/034_ledger_refund_dispute.sql"),
    "utf8"
  );

  assert.match(migration, /customer_refund/);
  assert.match(migration, /provider_earning_reversal/);
  assert.match(migration, /platform_commission_reversal/);
  assert.match(migration, /insert_ledger_entry/);
  assert.match(migration, /transactions_idempotency_key_uidx/);
  assert.match(migration, /transactions_payment_ledger_code_uidx/);
  assert.match(migration, /TEST_REFUND_ONLY/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION apply_test_refund\(UUID, TEXT\) TO service_role/);
  assert.match(migration, /REVOKE ALL ON FUNCTION apply_test_refund\(UUID, TEXT\) FROM authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION insert_ledger_entry[\s\S]*TO service_role/);
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION apply_test_refund\(UUID, TEXT\) TO (anon|authenticated)/
  );
});

test("8c. admin dispute resolution is service_role-only and test-settlement gated", () => {
  const migration = readFileSync(
    resolve(root, "supabase/migrations/037_admin_dispute_resolution.sql"),
    "utf8"
  );
  assert.match(migration, /resolve_order_dispute/);
  assert.match(migration, /preview_dispute_settlement/);
  assert.match(migration, /TEST_SETTLEMENT_ONLY/);
  assert.match(migration, /Admin authorization required/);
  assert.match(migration, /amounts_before/);
  assert.match(migration, /amounts_after/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION resolve_order_dispute[\s\S]*TO service_role/);
  assert.match(migration, /REVOKE ALL ON FUNCTION resolve_order_dispute[\s\S]*FROM authenticated/);
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION resolve_order_dispute[\s\S]*TO (anon|authenticated)/
  );

  const resolveRoute = readFileSync(
    resolve(root, "src/app/api/admin/disputes/[id]/resolve/route.ts"),
    "utf8"
  );
  assert.match(resolveRoute, /requireAdminContext/);
  assert.match(resolveRoute, /areTestPaymentsEnabled|TEST_PAYMENTS_DISABLED|resolveDisputeAsAdmin/);
});

test("route source fails closed without ENABLE_TEST_PAYMENTS and hard-denies production", () => {
  const paymentRoute = readFileSync(
    resolve(root, "src/app/api/finance/payments/[id]/route.ts"),
    "utf8"
  );
  const payoutRoute = readFileSync(
    resolve(root, "src/app/api/finance/provider-balance/route.ts"),
    "utf8"
  );
  const guard = readFileSync(
    resolve(root, "src/lib/payments/test-payments-guard.ts"),
    "utf8"
  );
  const screen = readFileSync(
    resolve(root, "src/components/finance/OrderPaymentScreen.tsx"),
    "utf8"
  );

  assert.match(guard, /ENABLE_TEST_PAYMENTS\?\.trim\(\) === "true"/);
  assert.match(guard, /isProductionRuntime/);
  assert.match(guard, /VERCEL_ENV/);
  assert.match(guard, /canInvokeSimulatedOrderPayment/);
  assert.doesNotMatch(guard, /NEXT_PUBLIC_ENABLE_TEST_PAYMENTS/);
  assert.match(paymentRoute, /areTestPaymentsEnabled\(\)/);
  assert.match(paymentRoute, /canInvokeSimulatedOrderPayment/);
  assert.match(paymentRoute, /status: 403/);
  assert.match(paymentRoute, /Number\(offer\.price\)/);
  assert.doesNotMatch(paymentRoute, /order_amount \?\? offer/);
  assert.match(paymentRoute, /void body\.amount/);
  assert.match(payoutRoute, /areTestPaymentsEnabled\(\)/);
  assert.match(payoutRoute, /status: 403/);
  assert.match(paymentRoute, /authorizeTestOrderPayment/);
  assert.match(
    readFileSync(resolve(root, "src/lib/payments/order-payment.ts"), "utf8"),
    /createAdminClient/
  );
  // Stripe-first; explicit test CTA only after useTestFallback.
  assert.match(screen, /useTestFallback/);
  assert.match(screen, /showTestFallback/);
  assert.doesNotMatch(
    screen,
    /if \(allowTestPayments\) \{\s*await runSimulatedPayment\(\);/
  );
});

console.log(`\n${passed} payment-security tests passed.`);
