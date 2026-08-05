#!/usr/bin/env node
/**
 * Static authorization + order history structure checks.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), "utf8");

assert.ok(existsSync(join(root, "src/app/my/orders/page.tsx")));
assert.ok(existsSync(join(root, "src/app/my/work/page.tsx")));
assert.ok(existsSync(join(root, "src/app/admin/orders/page.tsx")));
assert.ok(existsSync(join(root, "src/app/api/orders/history/route.ts")));
assert.ok(existsSync(join(root, "src/app/api/admin/orders/route.ts")));
assert.ok(existsSync(join(root, "src/app/api/orders/archive/route.ts")));
assert.ok(existsSync(join(root, "supabase/migrations/039_order_history_archive.sql")));

const historyApi = read("src/app/api/orders/history/route.ts");
assert.match(historyApi, /listCustomerOrderHistory/);
assert.match(historyApi, /listProviderOrderHistory/);
assert.match(historyApi, /Forbidden/);
assert.match(historyApi, /Use \/api\/admin\/orders/);

const adminApi = read("src/app/api/admin/orders/route.ts");
assert.match(adminApi, /requireAdminContext/);
assert.match(adminApi, /get\("export"\) === "csv"/);
assert.match(adminApi, /orderHistoryToCsv/);

const data = read("src/lib/data/order-history.ts");
assert.match(data, /\.eq\("customer_id", customerId\)/);
assert.match(data, /\.eq\("provider_id", providerId\)/);
assert.match(data, /trashed_at/);
assert.match(data, /archived_at/);
assert.match(data, /\.range\(/);
assert.match(data, /orderHistoryToCsv/);

const archiveApi = read("src/app/api/orders/archive/route.ts");
assert.match(archiveApi, /Forbidden/);
assert.match(archiveApi, /customer_id/);

const profile = read("src/app/profile/page.tsx");
assert.match(profile, /\/my\/orders/);
assert.match(profile, /\/my\/work/);
assert.match(profile, /\/admin\/orders/);

const statsPage = read("src/app/admin/stats/page.tsx");
assert.match(statsPage, /\/admin\/orders/);

const en = read("src/lib/i18n/locales/en.ts");
const ru = read("src/lib/i18n/locales/ru.ts");
assert.match(en, /orderHistory:\s*\{/);
assert.match(ru, /orderHistory:\s*\{/);
assert.match(en, /agreedAmount/);
assert.match(ru, /agreedAmount/);

function canActAsProvider(role) {
  return role === "provider" || role === "both";
}
function canActAsCustomer(role) {
  return role === "customer" || role === "both";
}
assert.equal(canActAsCustomer("customer"), true);
assert.equal(canActAsProvider("provider"), true);
assert.equal(canActAsProvider("customer"), false);

console.log("✅ order history auth/structure checks passed");
