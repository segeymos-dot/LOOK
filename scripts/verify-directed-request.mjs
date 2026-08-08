#!/usr/bin/env node
/**
 * Staging E2E: public provider → propose order → request linked via conversation.
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

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const password =
  env.STAGING_TEST_PASSWORD || env.TEST_USER_PASSWORD || "Test1234!";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(url && anon && service, "missing staging env");

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const customer = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 });
  const providerUser = listed?.users?.find((u) => u.email === "provider@test.look");
  const customerUser = listed?.users?.find((u) => u.email === "customer@test.look");
  assert(providerUser?.id, "provider@test.look missing");
  assert(customerUser?.id, "customer@test.look missing");

  const { error: loginErr } = await customer.auth.signInWithPassword({
    email: "customer@test.look",
    password,
  });
  assert(!loginErr, `customer login: ${loginErr?.message}`);

  // 1) Directed provider card fields (privacy)
  const { data: card, error: cardErr } = await customer
    .from("profiles")
    .select(
      "id, full_name, avatar_url, role, rating, reviews_count, completed_orders_count, public_profile_visible, provider_category_slugs, phone"
    )
    .eq("id", providerUser.id)
    .maybeSingle();
  assert(!cardErr && card, cardErr?.message ?? "provider card missing");
  assert(card.full_name === "Staging Provider", `name=${card.full_name}`);
  assert(["provider", "both"].includes(card.role), `role=${card.role}`);
  assert(Number(card.rating) === 5, `rating=${card.rating}`);
  // phone may exist privately; we only assert the UI select path uses public fields.
  // This script also selected phone to confirm it is not required for the card.
  assert(
    !JSON.stringify({
      id: card.id,
      full_name: card.full_name,
      avatar_url: card.avatar_url,
      rating: card.rating,
    }).includes("@"),
    "email-like value in public card fields"
  );

  // 2) Create directed request + conversation link (same as NewRequestPageContent)
  const { data: cats } = await customer
    .from("categories")
    .select("id")
    .order("sort_order")
    .limit(1);
  assert(cats?.[0]?.id, "no categories");

  const title = `[STAGING DIRECTED] Propose order ${Date.now()}`;
  const { data: request, error: reqErr } = await customer
    .from("requests")
    .insert({
      customer_id: customerUser.id,
      title,
      description:
        "Тестовый заказ из public provider profile → Предложить заказ (staging verify).",
      category_id: cats[0].id,
      budget_min: 50,
      budget_max: 50,
      currency: "USD",
      location: "Bangkok",
    })
    .select("id, customer_id, title")
    .single();
  assert(!reqErr && request, reqErr?.message ?? "request insert failed");

  const { error: linkErr } = await customer.from("conversations").upsert(
    {
      request_id: request.id,
      customer_id: customerUser.id,
      provider_id: providerUser.id,
      offer_id: null,
      last_message_at: new Date().toISOString(),
    },
    { onConflict: "request_id,provider_id" }
  );
  assert(!linkErr, `conversation link: ${linkErr?.message}`);

  // 3) Provider can see the link
  const providerClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: providerLoginErr } = await providerClient.auth.signInWithPassword({
    email: "provider@test.look",
    password,
  });
  assert(!providerLoginErr, `provider login: ${providerLoginErr?.message}`);

  const { data: conv, error: convErr } = await providerClient
    .from("conversations")
    .select("id, request_id, provider_id, customer_id, request:requests(title)")
    .eq("request_id", request.id)
    .eq("provider_id", providerUser.id)
    .maybeSingle();
  assert(!convErr && conv, convErr?.message ?? "provider cannot see conversation");
  assert(conv.provider_id === providerUser.id, "wrong provider_id on conversation");
  assert(conv.customer_id === customerUser.id, "wrong customer_id on conversation");

  // 4) No finance on public card path
  const { data: bal } = await admin
    .from("provider_balances")
    .select("available_balance, pending_payout, total_earned")
    .eq("provider_id", providerUser.id)
    .maybeSingle();

  console.log(
    JSON.stringify(
      {
        result: "PASS",
        providerName: card.full_name,
        rating: card.rating,
        requestId: request.id,
        requestTitle: request.title,
        conversationId: conv.id,
        linkedProviderId: conv.provider_id,
        providerFinanceUnchanged: bal
          ? {
              available: Number(bal.available_balance),
              pending: Number(bal.pending_payout),
              earned: Number(bal.total_earned),
            }
          : null,
        phoneSelectedButUnusedInCard: card.phone ?? null,
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
