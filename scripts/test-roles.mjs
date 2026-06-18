/**
 * Role and request viewer mode checks.
 * Run: node scripts/test-roles.mjs
 */

function canActAsProvider(role) {
  return role === "provider" || role === "both";
}

function canActAsCustomer(role) {
  return role === "customer" || role === "both";
}

function isRequestOwner(options) {
  const { customerId, userId, viewerIsOwner, viewerIsCustomer } = options;

  if (userId) {
    return userId === customerId;
  }

  if (viewerIsOwner === true || viewerIsCustomer === true) {
    return true;
  }

  if (viewerIsOwner === false || viewerIsCustomer === false) {
    return false;
  }

  return false;
}

function canRespondToRequest(options) {
  const {
    requestStatus,
    isRequestOwner,
    canActAsProvider,
    viewerUserId,
    customerId,
    ownOfferStatus,
  } = options;

  if (requestStatus !== "open" || !canActAsProvider || !viewerUserId || isRequestOwner) {
    return false;
  }

  if (viewerUserId === customerId) {
    return false;
  }

  if (!ownOfferStatus) {
    return true;
  }

  return ownOfferStatus === "rejected" || ownOfferStatus === "withdrawn";
}

const tests = [
  {
    name: "provider can act as provider",
    run: () => canActAsProvider("provider") === true,
  },
  {
    name: "both role can act as provider",
    run: () => canActAsProvider("both") === true,
  },
  {
    name: "customer cannot act as provider",
    run: () => canActAsProvider("customer") === false,
  },
  {
    name: "both role can respond on someone else's open request",
    run: () =>
      canRespondToRequest({
        requestStatus: "open",
        isRequestOwner: false,
        canActAsProvider: true,
        viewerUserId: "user-both",
        customerId: "user-customer",
        ownOfferStatus: null,
      }) === true,
  },
  {
    name: "both role cannot respond on own request",
    run: () =>
      canRespondToRequest({
        requestStatus: "open",
        isRequestOwner: true,
        canActAsProvider: true,
        viewerUserId: "user-both",
        customerId: "user-both",
        ownOfferStatus: null,
      }) === false,
  },
  {
    name: "both role owner flag false when viewerIsOwner is false without userId",
    run: () =>
      isRequestOwner({
        customerId: "user-a",
        userId: null,
        viewerIsOwner: false,
      }) === false,
  },
  {
    name: "pure customer role cannot respond even on others' orders",
    run: () =>
      canRespondToRequest({
        requestStatus: "open",
        isRequestOwner: false,
        canActAsProvider: false,
        viewerUserId: "user-customer",
        customerId: "user-other",
        ownOfferStatus: null,
      }) === false,
  },
  {
    name: "pending offer blocks new response",
    run: () =>
      canRespondToRequest({
        requestStatus: "open",
        isRequestOwner: false,
        canActAsProvider: true,
        viewerUserId: "provider-1",
        customerId: "customer-1",
        ownOfferStatus: "pending",
      }) === false,
  },
  {
    name: "rejected offer allows re-response",
    run: () =>
      canRespondToRequest({
        requestStatus: "open",
        isRequestOwner: false,
        canActAsProvider: true,
        viewerUserId: "provider-1",
        customerId: "customer-1",
        ownOfferStatus: "rejected",
      }) === true,
  },
];

let failed = 0;

for (const test of tests) {
  try {
    if (!test.run()) {
      console.error(`FAIL: ${test.name}`);
      failed += 1;
    } else {
      console.log(`OK: ${test.name}`);
    }
  } catch (error) {
    console.error(`ERROR: ${test.name}`, error);
    failed += 1;
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`\nAll ${tests.length} role checks passed.`);
