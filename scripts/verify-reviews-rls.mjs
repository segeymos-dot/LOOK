#!/usr/bin/env node
/**
 * Verify customer-only reviews RLS + API persistence.
 * Usage: node scripts/verify-reviews-rls.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = process.env.LOOK_APP_URL ?? "http://localhost:3000";

function loadEnvFile(path, { override = false } = {}) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, "");
    if (override || !process.env[key]) process.env[key] = value;
  }
}

// Match Next.js `next dev` precedence: later files override.
loadEnvFile(resolve(root, ".env"));
loadEnvFile(resolve(root, ".env.local"), { override: true });
loadEnvFile(resolve(root, ".env.development"), { override: true });
loadEnvFile(resolve(root, ".env.development.local"), { override: true });

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function signIn(email) {
  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: "Test1234!",
  });
  if (error || !data.session?.access_token) {
    throw new Error(`signIn failed for ${email}: ${error?.message ?? "no token"}`);
  }
  return {
    token: data.session.access_token,
    userId: data.user.id,
    supabase,
  };
}

async function jsonFetch(path, init = {}) {
  const res = await fetch(`${APP}${path}`, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const customer = await signIn("customer@test.look");
  const provider = await signIn("provider@test.look");

  // Find a completed order owned by customer with accepted provider
  const { data: orders, error: ordersError } = await customer.supabase
    .from("requests")
    .select("id, customer_id, status")
    .eq("customer_id", customer.userId)
    .eq("status", "completed")
    .order("updated_at", { ascending: false })
    .limit(10);

  assert(!ordersError, `orders query failed: ${ordersError?.message}`);
  assert(orders && orders.length > 0, "No completed customer orders found for review test");

  let target = null;
  for (const order of orders) {
    const { data: offer } = await customer.supabase
      .from("offers")
      .select("provider_id")
      .eq("request_id", order.id)
      .eq("status", "accepted")
      .maybeSingle();
    if (!offer) continue;

    // Clean previous review for idempotent re-run (service role if available)
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await admin.from("reviews").delete().eq("request_id", order.id);
    } else {
      const { data: existing } = await customer.supabase
        .from("reviews")
        .select("id")
        .eq("request_id", order.id)
        .maybeSingle();
      if (existing) continue;
    }

    target = { order, providerId: offer.provider_id };
    break;
  }

  assert(target, "No suitable completed order without (or cleaned) review");

  const { order, providerId } = target;
  const comment = `Verify review ${Date.now()}: отличная работа, всё вовремя.`;

  // 1) Stranger / provider cannot review
  const providerAttempt = await jsonFetch("/api/reviews", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reviewee_id: providerId,
      request_id: order.id,
      rating: 5,
      comment,
    }),
  });
  assert(providerAttempt.status === 403, `provider review should be 403, got ${providerAttempt.status}`);

  // 2) Customer can create review
  const create = await jsonFetch("/api/reviews", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${customer.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reviewee_id: providerId,
      request_id: order.id,
      rating: 5,
      comment,
    }),
  });
  assert(create.status === 200 && create.body?.success, `create failed: ${JSON.stringify(create.body)}`);
  assert(create.body.review?.rating === 5, "rating not saved");
  assert(create.body.review?.comment === comment, "comment not saved");
  assert(create.body.review?.reviewee_id === providerId, "reviewee_id missing");

  // 3) Duplicate blocked
  const dup = await jsonFetch("/api/reviews", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${customer.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reviewee_id: providerId,
      request_id: order.id,
      rating: 4,
      comment: `${comment} again`,
    }),
  });
  assert(dup.status === 409, `duplicate should be 409, got ${dup.status}`);

  // 4) Persist after refresh (re-read)
  const { data: persisted, error: readError } = await customer.supabase
    .from("reviews")
    .select("id, rating, comment, reviewee_id, provider_id, reviewer_id, request_id")
    .eq("request_id", order.id)
    .maybeSingle();
  assert(!readError && persisted, `persist read failed: ${readError?.message}`);
  assert(persisted.rating === 5 && persisted.comment === comment, "persisted values mismatch");

  const { data: providerProfile } = await customer.supabase
    .from("profiles")
    .select("rating, reviews_count")
    .eq("id", providerId)
    .single();
  assert(providerProfile, "provider profile missing");
  assert(Number(providerProfile.reviews_count) >= 1, "provider reviews_count not updated");
  assert(Number(providerProfile.rating) > 0, "provider rating not recalculated");

  console.log("✅ reviews RLS + API verification passed");
  console.log(
    JSON.stringify(
      {
        request_id: order.id,
        provider_id: providerId,
        rating: persisted.rating,
        reviews_count: providerProfile.reviews_count,
        provider_rating: providerProfile.rating,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("❌", error.message || error);
  process.exit(1);
});
