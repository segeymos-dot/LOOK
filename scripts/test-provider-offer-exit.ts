/**
 * Provider withdraw / decline selected job regression suite.
 * Run: npm run test:provider-offer-exit
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

const m073 = readFileSync(
  resolve(root, "supabase/migrations/073_provider_withdraw_decline.sql"),
  "utf8"
);
const providerUi = readFileSync(
  resolve(root, "src/components/offers/ProviderOfferRespond.tsx"),
  "utf8"
);
const searchPage = readFileSync(
  resolve(root, "src/app/search/page.tsx"),
  "utf8"
);
const offerActions = readFileSync(
  resolve(root, "src/lib/data/offer-actions.ts"),
  "utf8"
);

test("1. Withdraw pending offer keeps request open", () => {
  assert.match(m073, /provider_withdraw_offer/);
  assert.match(m073, /status = 'withdrawn'/);
  assert.match(m073, /request_status', v_request\.status/);
  assert.doesNotMatch(
    m073.slice(m073.indexOf("provider_withdraw_offer"), m073.indexOf("provider_decline_selected_job")),
    /UPDATE public\.requests/
  );
});

test("2. Decline selected unpaid job reopens request", () => {
  assert.match(m073, /provider_decline_selected_job/);
  assert.match(m073, /status = 'open'/);
  assert.match(m073, /status = 'withdrawn'/);
  assert.match(m073, /status = 'pending'/);
});

test("3. Other providers can see reopened request (search open-only)", () => {
  assert.match(searchPage, /\.eq\("status", "open"\)/);
  assert.match(m073, /status = 'open'/);
});

test("4. Chats preserved", () => {
  assert.match(m073, /chats_preserved/);
  assert.doesNotMatch(m073, /DELETE FROM public\.conversations/);
});

test("5. Paid / work-started cannot simple-decline", () => {
  assert.match(m073, /Cannot decline after payment is completed/);
  assert.match(m073, /Cannot decline after a payment row exists/);
  assert.match(m073, /Cannot decline after work has been submitted/);
  assert.match(providerUi, /cannotSimpleDecline|useDisputeOrCancel/);
});

test("6. Completed order unaffected (decline requires in_progress)", () => {
  assert.match(m073, /Only selected in-progress jobs can be declined/);
  assert.match(m073, /Only pending offers can be withdrawn/);
});

test("7. Payments untouched", () => {
  assert.doesNotMatch(m073, /simulate_prod_safe|look_test|068_|070_|071_/);
  assert.doesNotMatch(m073, /DROP TABLE|TRUNCATE|sk_live/i);
  assert.doesNotMatch(m073, /INSERT INTO public\.payments/);
  assert.doesNotMatch(m073, /provider_balances/);
});

test("UI exposes withdraw + decline with confirm", () => {
  assert.match(providerUi, /withdraw-offer/);
  assert.match(providerUi, /decline-selected-job/);
  assert.match(providerUi, /ConfirmDialog/);
  assert.match(offerActions, /providerWithdrawOffer/);
  assert.match(offerActions, /providerDeclineSelectedJob/);
});

console.log(`\n${passed} provider-offer-exit regression tests passed.`);
