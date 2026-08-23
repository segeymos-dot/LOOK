#!/usr/bin/env node
/**
 * Unit checks for role-scoped ledger visibility (no DB / no ledger writes).
 */
import assert from "node:assert/strict";

const LEDGER_CODES_BY_SCOPE = {
  customer: ["order_payment", "customer_refund"],
  provider: [
    "provider_earning",
    "provider_earning_reversal",
    "provider_payout",
    "provider_payout_reversal",
  ],
  platform: ["platform_commission", "platform_commission_reversal"],
  party: [
    "order_payment",
    "customer_refund",
    "provider_earning",
    "provider_earning_reversal",
    "provider_payout",
    "provider_payout_reversal",
  ],
};

function isLedgerVisibleToScope(code, scope) {
  if (scope === "admin") return true;
  return (LEDGER_CODES_BY_SCOPE[scope] ?? []).includes(code);
}

function resolveTransactionViewerScope({ requestedScope, isAdmin, role }) {
  const requested = (requestedScope ?? "auto").toLowerCase();
  const provider = role === "provider" || role === "both";
  const customer = role === "customer" || role === "both";

  if (requested === "admin" || requested === "platform") {
    if (!isAdmin) return { ok: false, status: 403 };
    return {
      ok: true,
      scope: requested === "platform" ? "platform" : "admin",
      viewer: requested === "platform" ? "platform" : "admin",
    };
  }
  if (requested === "provider") {
    if (!provider && !isAdmin) return { ok: false, status: 403 };
    return { ok: true, scope: "provider", viewer: "provider" };
  }
  if (requested === "customer") {
    if (!customer && !isAdmin) return { ok: false, status: 403 };
    return { ok: true, scope: "customer", viewer: "customer" };
  }
  if (isAdmin) return { ok: true, scope: "admin", viewer: "admin" };
  if (provider && customer) return { ok: true, scope: "party", viewer: "party" };
  if (provider) return { ok: true, scope: "provider", viewer: "provider" };
  if (customer) return { ok: true, scope: "customer", viewer: "customer" };
  return { ok: false, status: 403 };
}

const fullRefundLegs = [
  "order_payment",
  "provider_earning",
  "platform_commission",
  "customer_refund",
  "provider_earning_reversal",
  "platform_commission_reversal",
  "dispute_resolved",
];

const providerVisible = fullRefundLegs.filter((c) =>
  isLedgerVisibleToScope(c, "provider")
);
assert.deepEqual(providerVisible, [
  "provider_earning",
  "provider_earning_reversal",
]);
assert.equal(isLedgerVisibleToScope("customer_refund", "provider"), false);
assert.equal(
  isLedgerVisibleToScope("platform_commission_reversal", "provider"),
  false
);

const customerVisible = fullRefundLegs.filter((c) =>
  isLedgerVisibleToScope(c, "customer")
);
assert.deepEqual(customerVisible, ["order_payment", "customer_refund"]);

const platformVisible = fullRefundLegs.filter((c) =>
  isLedgerVisibleToScope(c, "platform")
);
assert.deepEqual(platformVisible, [
  "platform_commission",
  "platform_commission_reversal",
]);

assert.equal(isLedgerVisibleToScope("dispute_resolved", "admin"), true);
assert.equal(isLedgerVisibleToScope("dispute_resolved", "provider"), false);

// Partial / split: same visibility rules (amounts differ, codes don't).
const splitLegs = [
  "customer_refund",
  "provider_earning_reversal",
  "platform_commission_reversal",
  "provider_earning",
];
assert.deepEqual(
  splitLegs.filter((c) => isLedgerVisibleToScope(c, "provider")),
  ["provider_earning_reversal", "provider_earning"]
);

// Provider-win: no customer refund leg required; provider keeps earning.
assert.equal(isLedgerVisibleToScope("provider_earning", "provider"), true);
assert.equal(isLedgerVisibleToScope("customer_refund", "provider"), false);

const denied = resolveTransactionViewerScope({
  requestedScope: "admin",
  isAdmin: false,
  role: "provider",
});
assert.equal(denied.ok, false);
assert.equal(denied.status, 403);

const providerAuto = resolveTransactionViewerScope({
  requestedScope: "auto",
  isAdmin: false,
  role: "provider",
});
assert.equal(providerAuto.scope, "provider");

const providerBalance = resolveTransactionViewerScope({
  requestedScope: "provider",
  isAdmin: false,
  role: "provider",
});
assert.equal(providerBalance.scope, "provider");

const customerDeniedProvider = resolveTransactionViewerScope({
  requestedScope: "provider",
  isAdmin: false,
  role: "customer",
});
assert.equal(customerDeniedProvider.ok, false);

console.log("✅ transaction visibility checks passed");
