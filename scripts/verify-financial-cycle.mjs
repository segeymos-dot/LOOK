#!/usr/bin/env node
/**
 * Verify test financial cycle calculations (no Supabase required).
 */

const rate = Number(process.env.NEXT_PUBLIC_PLATFORM_COMMISSION_RATE ?? 0.15);
const gross = 1000;
const platformFee = Math.round(gross * rate * 100) / 100;
const providerAmount = Math.round((gross - platformFee) * 100) / 100;

const checks = [
  ["commission rate is 15%", rate === 0.15],
  ["gross 1000", gross === 1000],
  ["LOOK fee 150", platformFee === 150],
  ["provider 850", providerAmount === 850],
  ["split sums to gross", platformFee + providerAmount === gross],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (ok) console.log(`OK: ${name}`);
  else {
    console.error(`FAIL: ${name}`);
    failed++;
  }
}

console.log("\nExample: Customer pays $1000 → LOOK $150 → Provider $850");
console.log(`Rate: ${(rate * 100).toFixed(0)}%`);

if (failed > 0) process.exit(1);

console.log("\nAll financial calculation checks passed.");
console.log("\nManual UI test flow:");
console.log("1. Login as customer@test.look");
console.log("2. Open in_progress order → «Оплатить (тест)»");
console.log("3. «Завершить заказ»");
console.log("4. Login as provider@test.look → /my/balance");
console.log("5. Login as admin@test.look → /admin/platform");
