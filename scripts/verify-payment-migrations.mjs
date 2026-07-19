#!/usr/bin/env node
/**
 * Probe migrations 015–022 (payment + lifecycle) against linked Supabase.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");

function loadEnv() {
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY");
  process.exit(1);
}

const anonHeaders = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const adminHeaders = serviceKey
  ? { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" }
  : anonHeaders;

async function selectOk(table, columns) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${columns}&limit=1`, { headers: adminHeaders });
  return res.ok;
}

async function rpcExists(name, args = {}) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: anonHeaders,
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (res.ok) return true;
  if (text.includes("PGRST202") || text.includes("Could not find the function")) return false;
  return true;
}

async function signIn(email) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test1234!" }),
  });
  const data = await res.json();
  return data.access_token ? data : null;
}

const checks = [
  {
    file: "015_fix_test_user_roles.sql",
    label: "admin@test.look is_platform_admin",
    run: async () => {
      const auth = await signIn("admin@test.look");
      if (!auth) return "unknown";
      const res = await fetch(
        `${url}/rest/v1/profiles?id=eq.${auth.user.id}&select=is_platform_admin&limit=1`,
        { headers: { apikey: key, Authorization: `Bearer ${auth.access_token}` } }
      );
      if (!res.ok) return "missing";
      const [row] = await res.json();
      return row?.is_platform_admin ? "applied" : "missing";
    },
  },
  {
    file: "016_cancel_request_rpc.sql",
    label: "cancel_request RPC",
    run: async () =>
      (await rpcExists("cancel_request", {
        p_request_id: "00000000-0000-0000-0000-000000000001",
      }))
        ? "applied"
        : "missing",
  },
  {
    file: "017_order_work_lifecycle.sql",
    label: "submit_work RPC + work_submitted_at column",
    run: async () => {
      const col = await selectOk("requests", "work_submitted_at,revision_feedback");
      const fn = await rpcExists("submit_work", {
        p_request_id: "00000000-0000-0000-0000-000000000001",
      });
      return col && fn ? "applied" : "missing";
    },
  },
  {
    file: "018_platform_analytics.sql",
    label: "platform_analytics table",
    run: async () => ((await selectOk("platform_analytics", "id,page_views")) ? "applied" : "missing"),
  },
  {
    file: "019_category_name_en.sql",
    label: "categories.name_en column",
    run: async () => ((await selectOk("categories", "name_en")) ? "applied" : "missing"),
  },
  {
    file: "020_messages_attachment_columns.sql",
    label: "messages.attachment_urls + delivered_at",
    run: async () =>
      (await selectOk("messages", "attachment_urls,delivered_at")) ? "applied" : "missing",
  },
  {
    file: "021_payment_checkout.sql",
    label: "simulate_test_payment(p_request_id, p_external_reference)",
    run: async () => {
      const auth = await signIn("customer@test.look");
      if (!auth) return "unknown";
      const res = await fetch(`${url}/rest/v1/rpc/simulate_test_payment`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${auth.access_token}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          p_request_id: "00000000-0000-0000-0000-000000000001",
          p_external_reference: "probe_test",
        }),
      });
      const text = await res.text();
      if (text.includes("p_external_reference") && text.includes("Could not find")) return "missing";
      return "applied";
    },
  },
  {
    file: "022_order_payment_foundation.sql",
    label: "requests.order_payment_status + begin_order_payment RPC",
    run: async () => {
      const col = await selectOk(
        "requests",
        "order_payment_status,order_amount,look_commission,provider_payout_amount,payment_provider_name,payment_transaction_id,payout_status,paid_at"
      );
      const fn = await rpcExists("begin_order_payment", {
        p_request_id: "00000000-0000-0000-0000-000000000001",
      });
      return col && fn ? "applied" : "missing";
    },
  },
  {
    file: "023_submit_work_payment_guard.sql",
    label: "submit_work payment guard",
    run: async () =>
      (await rpcExists("submit_work", {
        p_request_id: "00000000-0000-0000-0000-000000000001",
      }))
        ? "applied"
        : "missing",
  },
  {
    file: "024_order_payment_lifecycle.sql",
    label: "accept_work + paid→completed lifecycle",
    run: async () =>
      (await rpcExists("accept_work", {
        p_request_id: "00000000-0000-0000-0000-000000000001",
      }))
        ? "applied"
        : "missing",
  },
  {
    file: "025_confirm_stripe_payment.sql",
    label: "confirm_stripe_payment RPC (service_role)",
    run: async () => {
      if (!serviceKey) return "unknown";
      const res = await fetch(`${url}/rest/v1/rpc/confirm_stripe_payment`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          p_request_id: "00000000-0000-0000-0000-000000000001",
          p_external_reference: "pi_probe",
        }),
      });
      const text = await res.text();
      if (text.includes("Could not find the function") || text.includes("PGRST202")) return "missing";
      return "applied";
    },
  },
  {
    file: "014_conversation_inbox.sql",
    label: "get_conversation_inbox RPC",
    run: async () => {
      const auth = await signIn("customer@test.look");
      if (!auth) return "unknown";
      const res = await fetch(`${url}/rest/v1/rpc/get_conversation_inbox`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${auth.access_token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const text = await res.text();
      if (text.includes("Could not find the function")) return "missing";
      return "applied";
    },
  },
  {
    file: "013_message_read.sql",
    label: "mark_conversation_read RPC",
    run: async () =>
      (await rpcExists("mark_conversation_read", {
        p_conversation_id: "00000000-0000-0000-0000-000000000001",
      }))
        ? "applied"
        : "missing",
  },
  {
    file: "009_request_lifecycle_rpc.sql",
    label: "cancel_request (009) + complete_request",
    run: async () => {
      const cancel = await rpcExists("cancel_request", {
        p_request_id: "00000000-0000-0000-0000-000000000001",
      });
      const complete = await rpcExists("complete_request", {
        p_request_id: "00000000-0000-0000-0000-000000000001",
      });
      return cancel && complete ? "applied" : cancel || complete ? "partial" : "missing";
    },
  },
];

async function main() {
  console.log("Payment & lifecycle migration probe:", url.replace(/https:\/\/([^.]+).*/, "https://$1..."));
  console.log("");
  const pending = [];
  for (const c of checks) {
    let status;
    try {
      status = await c.run();
    } catch (e) {
      status = `error: ${e.message}`;
    }
    const icon =
      status === "applied" ? "✅" : status === "partial" ? "⚠️" : status === "missing" ? "❌" : "❓";
    console.log(`${icon} ${c.file} — ${c.label}: ${status}`);
    if (status === "missing" || status === "partial") pending.push(c.file);
  }
  console.log("");
  if (pending.length === 0) {
    console.log("All payment-related migrations appear applied.");
  } else {
    console.log("Pending (apply in order):");
    const order = [
      "009_request_lifecycle_rpc.sql",
      "013_message_read.sql",
      "014_conversation_inbox.sql",
      "015_fix_test_user_roles.sql",
      "016_cancel_request_rpc.sql",
      "017_order_work_lifecycle.sql",
      "018_platform_analytics.sql",
      "019_category_name_en.sql",
      "020_messages_attachment_columns.sql",
      "021_payment_checkout.sql",
      "022_order_payment_foundation.sql",
      "023_submit_work_payment_guard.sql",
      "024_order_payment_lifecycle.sql",
      "025_confirm_stripe_payment.sql",
    ];
    for (const f of order) {
      if (pending.includes(f)) console.log(`  - supabase/migrations/${f}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
