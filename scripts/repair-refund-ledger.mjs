#!/usr/bin/env node
/**
 * Backfill full refund ledger rows for any payment already marked refunded
 * that is missing customer_refund / provider_earning_reversal / platform_commission_reversal.
 *
 * Platform-wide — does NOT filter by order title or test email.
 *
 * Usage:
 *   node scripts/repair-refund-ledger.mjs --dry-run
 *   node scripts/repair-refund-ledger.mjs --apply
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const apply = process.argv.includes("--apply");
const dryRun = !apply;

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env.local", ".env.development.local", ".env"]) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^"|"$/g, "");
      if (!(k in env)) env[k] = v;
    }
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log({ host: new URL(url).host, mode: dryRun ? "dry-run" : "apply" });

const { data: payments, error } = await admin
  .from("payments")
  .select("id, request_id, status, amount_gross, platform_fee, provider_amount, currency, customer_id, provider_id, refund_reason")
  .eq("status", "refunded")
  .order("updated_at", { ascending: false })
  .limit(200);

if (error) {
  console.error(error.message);
  process.exit(1);
}

let repaired = 0;
for (const payment of payments || []) {
  const { data: txs } = await admin
    .from("transactions")
    .select("id, type, ledger_code")
    .eq("payment_id", payment.id);

  const codes = new Set(
    (txs || []).map((t) => t.ledger_code || (t.type === "refund" ? "customer_refund" : t.type))
  );
  const missing = ["customer_refund", "provider_earning_reversal", "platform_commission_reversal"].filter(
    (c) => !codes.has(c)
  );
  if (missing.length === 0) continue;

  console.log("CANDIDATE", {
    payment_id: payment.id,
    request_id: payment.request_id,
    missing,
  });

  if (dryRun) continue;

  // Re-run idempotent RPC — fills missing ledger rows without double clawback when present.
  const { data, error: rpcError } = await admin.rpc("apply_test_refund", {
    p_request_id: payment.request_id,
    p_reason: payment.refund_reason || "ledger_backfill",
  });
  if (rpcError) {
    console.error("FAIL", payment.id, rpcError.message);
    process.exitCode = 1;
    continue;
  }
  console.log("REPAIRED", payment.request_id, data);
  repaired += 1;
}

console.log(dryRun ? "Dry-run complete" : `Repaired ${repaired} payments`);
