/**
 * Payment security tests — no Stripe, no remote DB mutations, no migration apply.
 * Run: npm run test:payment-security
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { areTestPaymentsEnabled } from "../src/lib/payments/test-payments-guard.ts";
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
  assert.equal(areTestPaymentsEnabled({ ENABLE_TEST_PAYMENTS: " true " }), false);
});

test("3. production with false flag → denied", () => {
  assert.equal(
    areTestPaymentsEnabled({
      NODE_ENV: "production",
      ENABLE_TEST_PAYMENTS: "false",
    }),
    false
  );
  assert.equal(
    areTestPaymentsEnabled({
      NODE_ENV: "production",
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

test("route source fails closed without ENABLE_TEST_PAYMENTS", () => {
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

  assert.match(guard, /ENABLE_TEST_PAYMENTS === "true"/);
  assert.doesNotMatch(guard, /NEXT_PUBLIC_ENABLE_TEST_PAYMENTS/);
  assert.match(paymentRoute, /areTestPaymentsEnabled\(\)/);
  assert.match(paymentRoute, /status: 403/);
  assert.match(payoutRoute, /areTestPaymentsEnabled\(\)/);
  assert.match(payoutRoute, /status: 403/);
  assert.match(paymentRoute, /authorizeTestOrderPayment/);
  assert.match(
    readFileSync(resolve(root, "src/lib/payments/order-payment.ts"), "utf8"),
    /createAdminClient/
  );
});

console.log(`\n${passed} payment-security tests passed.`);
