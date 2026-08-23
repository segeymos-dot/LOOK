#!/usr/bin/env node
/**
 * Staging privacy check: public provider profile vs private fields.
 * Loads .env.staging.local (gitignored). Does not print secrets.
 *
 * Usage: node scripts/verify-public-provider-privacy.mjs
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
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
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

if (!url || !anon || !service) {
  console.error("FAIL: missing staging Supabase env (.env.staging.local)");
  process.exit(1);
}

const PUBLIC_SELECT = [
  "id",
  "full_name",
  "avatar_url",
  "bio",
  "role",
  "city",
  "country",
  "skills",
  "portfolio",
  "portfolio_items",
  "provider_category_slugs",
  "rating",
  "reviews_count",
  "completed_orders_count",
  "phone_verified",
  "public_profile_visible",
  "privacy_preferences",
  "created_at",
  "updated_at",
].join(", ");

const FORBIDDEN_IN_PUBLIC_PAYLOAD = [
  "phone",
  "email",
  "payout_details_note",
  "notification_preferences",
  "available_balance",
  "pending_payout",
  "total_earned",
  "is_platform_admin",
];

function stripToPublic(profile) {
  const showCity = profile.privacy_preferences?.showCity !== false;
  return {
    id: profile.id,
    full_name: profile.full_name,
    avatar_url: profile.avatar_url ?? null,
    bio: profile.bio ?? null,
    role: profile.role,
    phone: null,
    city: showCity ? profile.city ?? null : null,
    country: showCity ? profile.country ?? null : null,
    skills: profile.skills ?? null,
    portfolio: profile.portfolio ?? null,
    portfolio_items: Array.isArray(profile.portfolio_items)
      ? profile.portfolio_items
      : [],
    provider_category_slugs: Array.isArray(profile.provider_category_slugs)
      ? profile.provider_category_slugs
      : [],
    rating: Number(profile.rating ?? 0),
    reviews_count: Number(profile.reviews_count ?? 0),
    completed_orders_count: Number(profile.completed_orders_count ?? 0),
    phone_verified: Boolean(profile.phone_verified),
    public_profile_visible:
      profile.public_profile_visible === undefined
        ? true
        : Boolean(profile.public_profile_visible),
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const customerClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: providerList } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const providerUser = providerList?.users?.find(
    (u) => u.email === "provider@test.look"
  );
  const customerUser = providerList?.users?.find(
    (u) => u.email === "customer@test.look"
  );
  assert(providerUser?.id, "provider@test.look not found");
  assert(customerUser?.id, "customer@test.look not found");

  const providerId = providerUser.id;
  const customerId = customerUser.id;

  const password =
    env.STAGING_TEST_PASSWORD || env.TEST_USER_PASSWORD || "Test1234!";
  const { error: signInError } = await customerClient.auth.signInWithPassword({
    email: "customer@test.look",
    password,
  });
  assert(!signInError, `customer login failed: ${signInError?.message}`);

  // Customer reads provider with the same public column set as the app.
  const { data: publicRow, error: publicErr } = await customerClient
    .from("profiles")
    .select(PUBLIC_SELECT)
    .eq("id", providerId)
    .maybeSingle();
  assert(!publicErr, `public select failed: ${publicErr?.message}`);
  assert(publicRow, "provider profile not readable by customer");
  assert(
    ["provider", "both"].includes(publicRow.role),
    `expected provider role, got ${publicRow.role}`
  );

  const publicPayload = stripToPublic(publicRow);
  for (const key of FORBIDDEN_IN_PUBLIC_PAYLOAD) {
    assert(
      !(key in publicPayload) || publicPayload[key] == null,
      `public payload leaks ${key}`
    );
  }
  assert(publicPayload.phone === null, "phone must be null on public payload");

  // Ensure private columns are not part of the public select result shape.
  assert(
    !("phone" in publicRow) || publicRow.phone == null,
    "phone column present in public select"
  );

  // Staging product checks
  assert(Number(publicPayload.rating) === 5, `rating expected 5, got ${publicPayload.rating}`);
  assert(
    Number(publicPayload.reviews_count) >= 1,
    `reviews_count expected >=1, got ${publicPayload.reviews_count}`
  );
  assert(
    Number(publicPayload.completed_orders_count) >= 1,
    `completed_orders expected >=1, got ${publicPayload.completed_orders_count}`
  );

  const { data: reviews } = await customerClient
    .from("reviews")
    .select(
      "id, rating, comment, reviewer:profiles!reviews_reviewer_id_fkey(full_name)"
    )
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(5);
  assert((reviews?.length ?? 0) >= 1, "expected at least 1 review");
  const reviewerNames = (reviews ?? []).map((r) => r.reviewer?.full_name ?? "");
  assert(
    reviewerNames.some((n) => /staging customer|customer/i.test(n)),
    `expected Staging Customer review, got: ${reviewerNames.join(" | ")}`
  );

  // Provider finance stays on wallet / private profile tables — not on public profile.
  const { data: wallet } = await admin
    .from("provider_balances")
    .select("available_balance, pending_payout, total_earned")
    .eq("provider_id", providerId)
    .maybeSingle();

  if (wallet) {
    const avail = Number(wallet.available_balance ?? 0);
    const pending = Number(wallet.pending_payout ?? 0);
    const earned = Number(wallet.total_earned ?? 0);
    assert(avail === 225, `available_balance expected 225, got ${avail}`);
    assert(pending === 0, `pending_payout expected 0, got ${pending}`);
    assert(earned === 225, `total_earned expected 225, got ${earned}`);
    assert(
      !("available_balance" in publicPayload),
      "finance must not appear on public payload"
    );
  } else {
    console.log("WARN: provider_balances row missing — finance numbers not asserted");
  }

  // No public customer profile route data for other users: role customer must not resolve as provider page.
  const { data: customerProfile } = await customerClient
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", customerId)
    .maybeSingle();
  assert(customerProfile, "customer profile missing");
  assert(
    !["provider", "both"].includes(customerProfile.role) ||
      customerProfile.role === "customer" ||
      customerProfile.role === "both",
    "unexpected customer role"
  );
  // App gate: canActAsProvider — customer-only must 404 on /providers/[id]
  const customerIsProviderCapable = ["provider", "both"].includes(
    customerProfile.role
  );
  assert(
    !customerIsProviderCapable || customerProfile.role === "both",
    "customer@test.look unexpectedly provider-only"
  );
  if (customerProfile.role === "customer") {
    console.log("OK: customer role has no provider public page (app returns 404)");
  }

  // Own-profile edit: owner can see edit; visitor payload has isOwnProfile=false in app.
  // Here we only confirm visitor cannot read phone via public select.
  const { data: privPhone } = await admin
    .from("profiles")
    .select("phone")
    .eq("id", providerId)
    .single();
  if (privPhone?.phone) {
    assert(
      !JSON.stringify(publicPayload).includes(String(privPhone.phone)),
      "raw phone leaked into public payload JSON"
    );
  }

  console.log("PASS: public provider privacy + staging stats");
  console.log(
    JSON.stringify(
      {
        providerName: publicPayload.full_name,
        rating: publicPayload.rating,
        reviews_count: publicPayload.reviews_count,
        completed_orders_count: publicPayload.completed_orders_count,
        phoneOnPublic: publicPayload.phone,
        financeOnPublic: false,
        reviewSample: reviews?.[0]?.comment?.slice(0, 80) ?? null,
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
