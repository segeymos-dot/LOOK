#!/usr/bin/env node
/**
 * Verify cancel_request RPC and full cancel-order flow.
 *
 * Usage:
 *   node scripts/verify-cancel-request.mjs
 *   node scripts/verify-cancel-request.mjs --apply
 *
 * --apply  runs supabase/migrations/016_cancel_request_rpc.sql (needs SUPABASE_DB_URL)
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");
const migrationPath = resolve(root, "supabase/migrations/016_cancel_request_rpc.sql");
const APP = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";

function loadEnv() {
  const env = {};
  if (!existsSync(envPath)) return env;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function pass(msg) {
  console.log(`✅ ${msg}`);
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

async function applyMigration(env) {
  const dbUrl = env.SUPABASE_DB_URL || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    fail(
      "SUPABASE_DB_URL is not set. Add it to .env.local or run:\n" +
        "  npm run supabase:apply-migration supabase/migrations/016_cancel_request_rpc.sql\n" +
        "Or paste SQL from that file in Supabase SQL Editor."
    );
  }

  const sql = readFileSync(migrationPath, "utf8");
  const { Client } = await import("pg");
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    pass("Applied 016_cancel_request_rpc.sql");
  } finally {
    await client.end();
  }
}

async function rpcExists(url, key, name, args = {}) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (res.ok) return true;
  if (text.includes("PGRST202") || text.includes("Could not find the function")) return false;
  return true;
}

async function signIn(url, key, email) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test1234!" }),
  });
  const data = await res.json();
  if (!data.access_token) fail(`Login failed for ${email}: ${data.error_description || data.msg}`);
  return {
    id: data.user.id,
    token: data.access_token,
    headers: {
      apikey: key,
      Authorization: `Bearer ${data.access_token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  };
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) fail("Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY in .env.local");

  if (process.argv.includes("--apply")) {
    await applyMigration(env);
  }

  console.log("LOOK cancel_request verification\n");

  const hasRpc = await rpcExists(url, key, "cancel_request", {
    p_request_id: "00000000-0000-0000-0000-000000000001",
  });
  if (hasRpc) {
    pass("cancel_request RPC exists");
  } else {
    console.log(
      "⚠️  cancel_request RPC is missing (apply 016_cancel_request_rpc.sql when SUPABASE_DB_URL is set)"
    );
  }

  const customer = await signIn(url, key, "customer@test.look");
  pass("customer@test.look login");

  const [cat] = await fetch(`${url}/rest/v1/categories?select=id&limit=1`, {
    headers: customer.headers,
  }).then((r) => r.json());
  if (!cat?.id) fail("No categories in database");

  const title = `Cancel audit ${Date.now()}`;
  const createRes = await fetch(`${url}/rest/v1/requests`, {
    method: "POST",
    headers: customer.headers,
    body: JSON.stringify({
      customer_id: customer.id,
      title,
      description: "Cancel flow verification",
      category_id: cat.id,
      budget_min: 500,
      budget_max: 500,
      status: "open",
      currency: "RUB",
    }),
  });
  if (createRes.status !== 201) fail(`Create request failed: ${createRes.status}`);
  const [request] = await createRes.json();
  pass(`Created open request ${request.id}`);

  if (hasRpc) {
    const cancelRpc = await fetch(`${url}/rest/v1/rpc/cancel_request`, {
      method: "POST",
      headers: customer.headers,
      body: JSON.stringify({ p_request_id: request.id }),
    });
    const cancelBody = await cancelRpc.json();
    if (!cancelRpc.ok || cancelBody.status !== "cancelled") {
      fail(`cancel_request RPC failed: ${JSON.stringify(cancelBody)}`);
    }
    pass("cancel_request RPC returned status cancelled");
  } else {
    console.log("⚠️  Skipping direct RPC test (function not deployed)");
  }

  const apiSignIn = await fetch(`${APP}/api/auth/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "customer@test.look", password: "Test1234!" }),
  });
  const apiData = await apiSignIn.json();
  if (!apiSignIn.ok || !apiData.session?.access_token) {
    fail("App sign-in failed (is dev server running on " + APP + "?)");
  }
  pass("App /api/auth/sign-in OK");

  if (!hasRpc) {
    const apiCancelFirst = await fetch(`${APP}/api/requests/${request.id}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiData.session.access_token}`,
        "Content-Type": "application/json",
      },
    });
    const apiCancelFirstBody = await apiCancelFirst.json();
    if (!apiCancelFirst.ok || !apiCancelFirstBody.success || apiCancelFirstBody.status !== "cancelled") {
      fail(
        `POST /api/requests/[id]/cancel failed: ${apiCancelFirst.status} ${JSON.stringify(apiCancelFirstBody)}`
      );
    }
    pass("POST /api/requests/[id]/cancel (UI path) OK");
  }

  const { status } = await fetch(`${url}/rest/v1/requests?id=eq.${request.id}&select=status`, {
    headers: customer.headers,
  })
    .then((r) => r.json())
    .then((rows) => rows[0] ?? {});
  if (status !== "cancelled") fail(`DB status is ${status}, expected cancelled`);
  pass("Request status in DB is cancelled");

  let historyRequestId = request.id;

  if (hasRpc) {
    const title2 = `Cancel UI audit ${Date.now()}`;
    const create2 = await fetch(`${url}/rest/v1/requests`, {
      method: "POST",
      headers: customer.headers,
      body: JSON.stringify({
        customer_id: customer.id,
        title: title2,
        description: "Cancel via UI API route",
        category_id: cat.id,
        budget_min: 700,
        budget_max: 700,
        status: "open",
        currency: "RUB",
      }),
    });
    const [request2] = await create2.json();
    pass(`Created second request ${request2.id} for UI API test`);
    historyRequestId = request2.id;

    const apiCancel = await fetch(`${APP}/api/requests/${request2.id}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiData.session.access_token}`,
        "Content-Type": "application/json",
      },
    });
    const apiCancelBody = await apiCancel.json();
    if (!apiCancel.ok || !apiCancelBody.success || apiCancelBody.status !== "cancelled") {
      fail(`POST /api/requests/[id]/cancel failed: ${apiCancel.status} ${JSON.stringify(apiCancelBody)}`);
    }
    pass("POST /api/requests/[id]/cancel (UI path) OK");
  }

  const history = await fetch(
    `${url}/rest/v1/requests?customer_id=eq.${customer.id}&id=eq.${historyRequestId}&select=id,title,status`,
    { headers: customer.headers }
  ).then((r) => r.json());
  if (history[0]?.status !== "cancelled") fail("Cancelled request not visible in my requests query");
  pass("Cancelled request visible in customer history (/my/requests data)");

  console.log("\nAll cancel_request checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
