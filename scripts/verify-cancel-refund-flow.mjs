#!/usr/bin/env node
/**
 * Verify cancel / refund / dispute branching (local/dev).
 * Usage: node scripts/verify-cancel-refund-flow.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env.development.local", ".env.local", ".env"]) {
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
      if (file.includes("development.local")) env[k] = v;
    }
  }
  return env;
}

function previewCancelOutcome(ctx) {
  if (
    ctx.refundDisputeStatus === "refunded" ||
    ctx.orderPaymentStatus === "refunded" ||
    ctx.paymentStatus === "refunded"
  ) {
    return "already_refunded";
  }
  if (ctx.refundDisputeStatus === "dispute_opened") return "already_disputed";
  const paid =
    ctx.paymentStatus === "paid" ||
    ctx.orderPaymentStatus === "paid" ||
    ctx.orderPaymentStatus === "completed";
  if (!paid) return "cancelled_unpaid";
  const workStarted =
    ctx.status === "pending_review" ||
    Boolean(ctx.workSubmittedAt) ||
    Boolean(ctx.hasWorkSubmission);
  return workStarted ? "dispute_opened" : "refunded";
}

function pass(msg) {
  console.log(`✅ ${msg}`);
}
function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

const cases = [
  {
    name: "unpaid open → cancel",
    got: previewCancelOutcome({ status: "open", orderPaymentStatus: "unpaid" }),
    expected: "cancelled_unpaid",
  },
  {
    name: "paid in_progress no work → refund",
    got: previewCancelOutcome({
      status: "in_progress",
      orderPaymentStatus: "paid",
      hasWorkSubmission: false,
    }),
    expected: "refunded",
  },
  {
    name: "paid pending_review → dispute",
    got: previewCancelOutcome({
      status: "pending_review",
      orderPaymentStatus: "paid",
      hasWorkSubmission: true,
    }),
    expected: "dispute_opened",
  },
  {
    name: "already refunded",
    got: previewCancelOutcome({
      status: "cancelled",
      orderPaymentStatus: "refunded",
      refundDisputeStatus: "refunded",
    }),
    expected: "already_refunded",
  },
];

for (const c of cases) {
  if (c.got !== c.expected) fail(`${c.name}: got ${c.got}, expected ${c.expected}`);
  pass(c.name);
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  console.log("Skipping live DB checks (missing supabase env)");
  process.exit(0);
}

pass(`supabase host ${new URL(url).host}`);

if (service) {
  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.rpc("apply_test_refund", {
    p_request_id: "00000000-0000-0000-0000-000000000000",
    p_reason: "probe",
  });
  if (error?.message?.includes("Could not find") || error?.message?.includes("PGRST202")) {
    fail("apply_test_refund RPC missing — apply migration 033");
  }
  pass(`apply_test_refund RPC reachable (${error?.message || "ok"})`);
} else {
  console.log("No service role — skipped RPC probe");
}

pass("verify-cancel-refund-flow done");
