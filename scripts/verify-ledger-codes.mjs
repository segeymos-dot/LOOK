#!/usr/bin/env node
/**
 * Unit checks for ledger code resolution and signed amounts (no DB).
 */
import assert from "node:assert/strict";

const LEDGER_CODES = [
  "order_payment",
  "provider_earning",
  "platform_commission",
  "customer_refund",
  "provider_earning_reversal",
  "platform_commission_reversal",
  "provider_payout",
  "provider_payout_reversal",
  "dispute_opened",
  "dispute_resolved",
];

const LEGACY = {
  refund: "customer_refund",
  order_payment: "order_payment",
};

function resolveLedgerCode(type, ledgerCode) {
  if (ledgerCode && LEDGER_CODES.includes(ledgerCode)) return ledgerCode;
  if (type && LEGACY[type]) return LEGACY[type];
  return ledgerCode || type || "unknown";
}

function signedAmountForViewer(code, amount, amountSigned, viewer) {
  const abs = Math.abs(Number(amount) || 0);
  if (amountSigned != null && Number.isFinite(Number(amountSigned)) && viewer === "admin") {
    return Number(amountSigned);
  }
  switch (code) {
    case "order_payment":
      return viewer === "customer" || viewer === "admin" ? -abs : 0;
    case "customer_refund":
      return viewer === "customer" || viewer === "admin" ? abs : 0;
    case "provider_earning":
      return viewer === "provider" || viewer === "admin" ? abs : 0;
    case "provider_earning_reversal":
      return viewer === "provider" || viewer === "admin" ? -abs : 0;
    case "platform_commission":
      return viewer === "platform" || viewer === "admin" ? abs : 0;
    case "platform_commission_reversal":
      return viewer === "platform" || viewer === "admin" ? -abs : 0;
    case "provider_payout":
      return viewer === "provider" || viewer === "admin" ? -abs : 0;
    case "provider_payout_reversal":
      return viewer === "provider" || viewer === "admin" ? abs : 0;
    default:
      return 0;
  }
}

assert.equal(resolveLedgerCode("refund"), "customer_refund");
assert.equal(resolveLedgerCode("order_payment"), "order_payment");
assert.equal(resolveLedgerCode("x", "customer_refund"), "customer_refund");

assert.equal(signedAmountForViewer("order_payment", 100, -100, "customer"), -100);
assert.equal(signedAmountForViewer("customer_refund", 100, 100, "customer"), 100);
assert.equal(signedAmountForViewer("provider_earning", 85, 85, "provider"), 85);
assert.equal(signedAmountForViewer("provider_earning_reversal", 85, -85, "provider"), -85);
assert.equal(signedAmountForViewer("platform_commission", 15, 15, "platform"), 15);
assert.equal(signedAmountForViewer("platform_commission_reversal", 15, -15, "platform"), -15);

const gross = 100;
const fee = 15;
const earn = 85;
assert.equal(
  Math.abs(signedAmountForViewer("order_payment", gross, null, "customer")),
  Math.abs(signedAmountForViewer("provider_earning", earn, null, "provider")) +
    Math.abs(signedAmountForViewer("platform_commission", fee, null, "platform"))
);
assert.equal(
  Math.abs(signedAmountForViewer("customer_refund", gross, null, "customer")),
  Math.abs(signedAmountForViewer("provider_earning_reversal", earn, null, "provider")) +
    Math.abs(signedAmountForViewer("platform_commission_reversal", fee, null, "platform"))
);

console.log("✅ ledger unit checks passed");
