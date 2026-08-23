#!/usr/bin/env node
/**
 * Staging: provider incoming directed inbox.
 * Loads .env.staging.local. Does not print secrets.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const env = {
  ...loadEnvFile(resolve(process.cwd(), ".env.staging.local")),
  ...process.env,
};

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const password =
  env.STAGING_TEST_PASSWORD || env.TEST_USER_PASSWORD || "Test1234!";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(url && anon && service, "missing staging env");

  // Dynamic import compiled TS helpers via running the same SQL logic here
  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const providerClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 });
  const providerUser = listed?.users?.find((u) => u.email === "provider@test.look");
  const customerUser = listed?.users?.find((u) => u.email === "customer@test.look");
  assert(providerUser?.id, "provider missing");
  assert(customerUser?.id, "customer missing");

  const { error: loginErr } = await providerClient.auth.signInWithPassword({
    email: "provider@test.look",
    password,
  });
  assert(!loginErr, `provider login: ${loginErr?.message}`);

  const { data: directed, error } = await providerClient
    .from("conversations")
    .select(
      `
      id, is_directed, offer_id, provider_id, customer_id, request_id,
      request:requests(
        id, title, status, budget_min, budget_max, currency, location, created_at,
        category:categories(id, name, slug),
        customer:profiles!requests_customer_id_fkey(id, full_name, avatar_url, phone)
      )
    `
    )
    .eq("provider_id", providerUser.id)
    .eq("is_directed", true)
    .order("created_at", { ascending: false });

  assert(!error, error?.message ?? "directed query failed");
  assert((directed?.length ?? 0) >= 1, "expected >=1 directed request");

  const titles = (directed ?? []).map((d) => d.request?.title ?? "");
  assert(
    titles.some((t) => /заказ теста/i.test(t)),
    `missing «заказ теста», got: ${titles.join(" | ")}`
  );

  // Pending = open + no offer from this provider
  const { data: offers } = await providerClient
    .from("offers")
    .select("request_id, status")
    .eq("provider_id", providerUser.id)
    .in(
      "request_id",
      (directed ?? []).map((d) => d.request_id)
    );

  const offered = new Set((offers ?? []).map((o) => o.request_id));
  const pending = (directed ?? []).filter(
    (d) => d.request?.status === "open" && !offered.has(d.request_id)
  );
  assert(pending.length >= 1, `pending badge expected >=1, got ${pending.length}`);

  for (const row of directed ?? []) {
    assert(row.provider_id === providerUser.id, "wrong provider_id");
    assert(row.is_directed === true, "is_directed false");
    const cust = row.request?.customer;
    assert(cust?.full_name, "customer display name missing");
    // phone may be selected for audit — must not be required; ensure we don't treat it as public card field
    assert(cust && "full_name" in cust && "avatar_url" in cust, "customer shape");
  }

  // Privacy: another authenticated user who is NOT the provider participant
  // cannot list provider-scoped inbox via provider_id filter when not participant.
  // Admin/customer as non-provider on someone else's directed: customer is participant — OK.
  // Create a throwaway check: filter by provider_id as customer returns only rows where they are customer.
  const customerClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await customerClient.auth.signInWithPassword({
    email: "customer@test.look",
    password,
  });
  const { data: asCustomer } = await customerClient
    .from("conversations")
    .select("id, provider_id, customer_id")
    .eq("provider_id", providerUser.id)
    .eq("is_directed", true);
  for (const row of asCustomer ?? []) {
    assert(
      row.customer_id === customerUser.id || row.provider_id === customerUser.id,
      "customer saw non-participant directed conversation"
    );
  }

  console.log(
    JSON.stringify(
      {
        result: "PASS",
        directedCount: directed.length,
        pendingBadge: pending.length,
        titles,
        hasZakazTesta: titles.some((t) => /заказ теста/i.test(t)),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("FAIL:", e.message || e);
  process.exit(1);
});
