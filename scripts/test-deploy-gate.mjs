#!/usr/bin/env node
/**
 * Deploy safety gate for LOOK production.
 * Fails non-zero if critical checks fail — do not deploy.
 *
 * Usage: npm run test:deploy-gate
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", shell: false });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    console.error(`FAIL: ${cmd} ${args.join(" ")} exit=${r.status}`);
    process.exit(r.status || 1);
  }
}

// 1) typecheck
run("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"]);

// 2) payment security
run("npm", ["run", "test:payment-security"]);

// 3) prod-safe regression
run("npm", ["run", "test:prod-safe-payments"]);

// 4) migration compatibility — 068/070 present; no sk_live in repo migrations
for (const f of [
  "supabase/migrations/068_prod_safe_test_payments.sql",
  "supabase/migrations/070_admin_mark_request_is_test.sql",
]) {
  if (!existsSync(resolve(root, f))) {
    console.error(`FAIL: missing ${f}`);
    process.exit(1);
  }
}

const m070 = readFileSync(
  resolve(root, "supabase/migrations/070_admin_mark_request_is_test.sql"),
  "utf8"
);
if (/DROP TABLE|TRUNCATE|sk_live_/i.test(m070)) {
  console.error("FAIL: destructive or live Stripe content in 070");
  process.exit(1);
}

console.log("\nDeploy gate PASS — safe to deploy after applying migration 070.");
