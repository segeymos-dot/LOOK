/**
 * Pure unit checks for UI mode helpers (no network).
 * Run: node scripts/test-ui-mode.mjs
 */

function resolveEffectiveUiMode(role, stored) {
  if (role === "provider") return "provider";
  if (role === "both") return stored === "provider" ? "provider" : "customer";
  return "customer";
}

function canSwitchUiMode(role) {
  return role === "both";
}

function canActAsProvider(role) {
  return role === "provider" || role === "both";
}

function canActAsCustomer(role) {
  return role === "customer" || role === "both";
}

const tests = [
  {
    name: "both without stored → customer UI",
    run: () => resolveEffectiveUiMode("both", null) === "customer",
  },
  {
    name: "both + provider stored → provider UI",
    run: () => resolveEffectiveUiMode("both", "provider") === "provider",
  },
  {
    name: "provider-only ignores stored customer",
    run: () => resolveEffectiveUiMode("provider", "customer") === "provider",
  },
  {
    name: "customer-only ignores stored provider",
    run: () => resolveEffectiveUiMode("customer", "provider") === "customer",
  },
  {
    name: "switch only for both",
    run: () =>
      canSwitchUiMode("both") &&
      !canSwitchUiMode("customer") &&
      !canSwitchUiMode("provider"),
  },
  {
    name: "deep-link permissions use role not uiMode",
    run: () => {
      const role = "both";
      const ui = resolveEffectiveUiMode(role, "customer");
      // Customer shell, but can still act as provider on API/deep links
      return ui === "customer" && canActAsProvider(role) && canActAsCustomer(role);
    },
  },
  {
    name: "provider-only cannot get customer capability via uiMode",
    run: () => {
      const role = "provider";
      const ui = resolveEffectiveUiMode(role, "customer");
      return ui === "provider" && !canActAsCustomer(role);
    },
  },
];

let failed = 0;
for (const test of tests) {
  const ok = test.run();
  console.log(`${ok ? "PASS" : "FAIL"}  ${test.name}`);
  if (!ok) failed += 1;
}

console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
