/**
 * Marketplace offer lifecycle regression suite (static / contract).
 * Run: npm run test:offer-marketplace
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

/** Mirrors src/lib/auth/roles.ts canRespondToRequest (no path-alias import). */
function canRespondToRequest(options: {
  requestStatus: string;
  isRequestOwner: boolean;
  canActAsProvider: boolean;
  viewerUserId?: string | null;
  customerId: string;
  ownOfferStatus?: string | null;
}): boolean {
  if (options.requestStatus !== "open" || !options.canActAsProvider) return false;
  if (!options.viewerUserId || options.isRequestOwner) return false;
  if (options.viewerUserId === options.customerId) return false;
  if (!options.ownOfferStatus) return true;
  return (
    options.ownOfferStatus === "rejected" ||
    options.ownOfferStatus === "withdrawn"
  );
}

const submitOffer = readFileSync(
  resolve(root, "src/lib/data/submit-offer.ts"),
  "utf8"
);
const searchPage = readFileSync(
  resolve(root, "src/app/search/page.tsx"),
  "utf8"
);
const acceptMig = readFileSync(
  resolve(root, "supabase/migrations/022_order_payment_foundation.sql"),
  "utf8"
);
const unassignMig = readFileSync(
  resolve(root, "supabase/migrations/072_unassign_selected_provider.sql"),
  "utf8"
);
const offerCard = readFileSync(
  resolve(root, "src/components/offers/OfferCard.tsx"),
  "utf8"
);
const offersList = readFileSync(
  resolve(root, "src/components/offers/RequestOffersList.tsx"),
  "utf8"
);

test("1. Provider A offer does not update request status (submitOffer)", () => {
  assert.match(submitOffer, /request\.status !== "open"/);
  assert.doesNotMatch(submitOffer, /\.from\("requests"\)\s*\.update/);
  assert.match(submitOffer, /\.from\("offers"\)\s*\.insert/);
});

test("2. Search shows only open orders (not in_progress)", () => {
  assert.match(searchPage, /\.eq\("status", "open"\)/);
  assert.doesNotMatch(searchPage, /\.in\("status", \["open", "in_progress"\]\)/);
});

test("3. Multiple offers allowed — unique is per provider, not global", () => {
  assert.match(submitOffer, /existingOffer\?\.status === "pending"/);
});

test("4. Different prices stored on each offer insert", () => {
  assert.match(submitOffer, /price: input\.price/);
});

test("5. Customer select provider = accept_offer sets in_progress", () => {
  assert.match(acceptMig, /status = 'in_progress'/);
  assert.match(acceptMig, /status = 'accepted'/);
  assert.match(acceptMig, /status = 'rejected'/);
});

test("6. Order hidden from new provider search after selection", () => {
  assert.match(searchPage, /\.eq\("status", "open"\)/);
  assert.equal(
    canRespondToRequest({
      requestStatus: "in_progress",
      isRequestOwner: false,
      canActAsProvider: true,
      viewerUserId: "p2",
      customerId: "c1",
      ownOfferStatus: null,
    }),
    false
  );
});

test("7. Other pending offers rejected on accept", () => {
  assert.match(
    acceptMig,
    /AND id <> p_offer_id\s+AND status = 'pending'/
  );
});

test("8. Unassign restores open + pending offers", () => {
  assert.match(unassignMig, /unassign_selected_provider/);
  assert.match(unassignMig, /status = 'open'/);
  assert.match(unassignMig, /status = 'pending'/);
  assert.match(unassignMig, /Cannot unassign after a payment row exists/);
  assert.match(unassignMig, /work_submitted_at/);
});

test("9. Order visible again after unassign (status open + search open-only)", () => {
  assert.match(unassignMig, /status = 'open'/);
  assert.match(searchPage, /\.eq\("status", "open"\)/);
});

test("10. Chats preserved on unassign", () => {
  assert.match(unassignMig, /Conversations intentionally kept intact|chats_preserved/);
  assert.doesNotMatch(unassignMig, /DELETE FROM public\.conversations/);
});

test("11. No duplicate active offer from same provider", () => {
  assert.match(submitOffer, /existingOffer\?\.status === "pending"/);
  assert.equal(
    canRespondToRequest({
      requestStatus: "open",
      isRequestOwner: false,
      canActAsProvider: true,
      viewerUserId: "p1",
      customerId: "c1",
      ownOfferStatus: "pending",
    }),
    false
  );
});

test("12. Completed/in_progress never appear as open in search", () => {
  assert.match(searchPage, /\.eq\("status", "open"\)/);
  assert.equal(
    canRespondToRequest({
      requestStatus: "completed",
      isRequestOwner: false,
      canActAsProvider: true,
      viewerUserId: "p1",
      customerId: "c1",
      ownOfferStatus: null,
    }),
    false
  );
});

test("UI: select provider + per-offer chat before accept", () => {
  assert.match(offerCard, /selectProvider/);
  assert.match(offerCard, /offer\.openChat/);
  assert.match(offersList, /unassignProvider/);
});

test("Payments / payouts / test-payment migrations untouched by offer suite", () => {
  assert.doesNotMatch(searchPage, /PaymentMethodsCard|profile\/payments/);
  assert.doesNotMatch(unassignMig, /simulate_prod_safe|look_test|is_test/);
  assert.doesNotMatch(unassignMig, /DROP TABLE|TRUNCATE/i);
});

console.log(`\n${passed} offer-marketplace regression tests passed.`);
