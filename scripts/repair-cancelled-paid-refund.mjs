#!/usr/bin/env node
/**
 * Repair cancelled-but-still-paid test orders into a proper refunded state.
 *
 * Usage:
 *   node scripts/repair-cancelled-paid-refund.mjs --dry-run
 *   node scripts/repair-cancelled-paid-refund.mjs --apply
 *   node scripts/repair-cancelled-paid-refund.mjs --apply --title "Refund test order"
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local
 * Optional: apply migration 033 first (apply_test_refund RPC).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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
      if (!(k in env) || file.includes("local")) env[k] = v;
    }
  }
  return env;
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

const env = loadEnv();
const apply = process.argv.includes("--apply");
const dryRun = !apply || process.argv.includes("--dry-run");
const titleFilter = argValue("--title") || "Refund test order";
const amountFilter = Number(argValue("--amount") || "250");

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !service) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log({
  host: new URL(url).host,
  mode: dryRun ? "dry-run" : "apply",
  titleFilter,
  amountFilter,
});

const { data: requests, error } = await admin
  .from("requests")
  .select(
    "id, title, status, order_payment_status, refund_dispute_status, customer_id, currency, order_amount"
  )
  .eq("status", "cancelled")
  .order("updated_at", { ascending: false })
  .limit(50);

if (error) {
  console.error(error.message);
  process.exit(1);
}

const candidates = [];
for (const req of requests || []) {
  const { data: payment } = await admin
    .from("payments")
    .select("id, status, amount_gross, provider_amount, currency, payment_method")
    .eq("request_id", req.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment) continue;
  if (payment.status !== "paid") continue;
  const amount = Number(payment.amount_gross);
  const titleOk =
    !titleFilter ||
    String(req.title || "").toLowerCase().includes(titleFilter.toLowerCase());
  const amountOk = !amountFilter || Math.abs(amount - amountFilter) < 0.01;
  if (!titleOk && !amountOk) continue;
  if (titleFilter && !titleOk) continue;

  candidates.push({ req, payment, amount });
}

if (candidates.length === 0) {
  console.log("No cancelled+paid candidates found.");
  process.exit(0);
}

for (const item of candidates) {
  console.log("CANDIDATE", {
    id: item.req.id,
    title: item.req.title,
    amount: item.amount,
    currency: item.payment.currency,
    payment_status: item.payment.status,
    order_payment_status: item.req.order_payment_status,
  });

  if (dryRun) continue;

  let { data, error: refundError } = await admin.rpc("apply_test_refund", {
    p_request_id: item.req.id,
    p_reason: "Repair: cancelled paid test order without refund ledger",
  });

  if (refundError?.message?.includes("Could not find") || refundError?.message?.includes("PGRST202")) {
    ({ data, error: refundError } = await admin.rpc("simulate_test_refund", {
      p_request_id: item.req.id,
    }));
    if (!refundError) {
      await admin
        .from("requests")
        .update({
          order_payment_status: "refunded",
          refund_dispute_status: "refunded",
          refund_amount: item.amount,
          refund_reason: "Repair: cancelled paid test order without refund ledger",
          refunded_at: new Date().toISOString(),
          cancellation_reason: "Repair refund for cancelled paid test order",
        })
        .eq("id", item.req.id);
    }
  }

  if (refundError) {
    console.error("FAIL", item.req.id, refundError.message);
    process.exitCode = 1;
    continue;
  }

  console.log("REPAIRED", item.req.id, data);
}

if (dryRun) {
  console.log("Dry-run only. Re-run with --apply to repair.");
}
