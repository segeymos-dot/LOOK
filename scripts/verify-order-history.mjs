#!/usr/bin/env node
/**
 * Static + live verification of role-scoped order history loading.
 * Live checks need local Supabase + test users (password Test1234!).
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), "utf8");

assert.ok(existsSync(join(root, "src/app/my/orders/page.tsx")));
assert.ok(existsSync(join(root, "src/app/my/work/page.tsx")));
assert.ok(existsSync(join(root, "src/app/admin/orders/page.tsx")));
assert.ok(existsSync(join(root, "supabase/migrations/039_order_history_archive.sql")));

const historyApi = read("src/app/api/orders/history/route.ts");
assert.match(historyApi, /listCustomerOrderHistory/);
assert.match(historyApi, /listProviderOrderHistory/);
assert.match(historyApi, /result\.error/);
assert.match(historyApi, /auth\.user\.id/);

const adminApi = read("src/app/api/admin/orders/route.ts");
assert.match(adminApi, /requireAdminContext/);
assert.match(adminApi, /orderHistoryToCsv/);
assert.match(adminApi, /result\.error/);

const data = read("src/lib/data/order-history.ts");
assert.match(data, /\.eq\("customer_id", customerId\)/);
assert.match(data, /\.eq\("provider_id", providerId\)/);
assert.match(data, /isMissingArchiveColumnError/);
assert.match(data, /retrying legacy/);
assert.match(data, /trashed_at/);
assert.match(data, /archived_at/);

const profile = read("src/app/profile/page.tsx");
assert.match(profile, /\/my\/orders/);
assert.match(profile, /\/my\/work/);
assert.match(profile, /\/admin\/orders/);

assert.match(read("src/lib/i18n/locales/en.ts"), /orderHistory:\s*\{/);
assert.match(read("src/lib/i18n/locales/ru.ts"), /orderHistory:\s*\{/);

console.log("✅ static auth/structure checks passed");

function loadLocalSupabaseEnv() {
  let apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const out = execSync("npx supabase status -o env", {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const line of out.split("\n")) {
      const m = line.match(/^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=(.*)$/);
      if (!m) continue;
      const v = m[2].replace(/^"|"$/g, "");
      if (m[1] === "API_URL") apiUrl = v;
      if (m[1] === "ANON_KEY") anon = v;
      if (m[1] === "SERVICE_ROLE_KEY") service = v;
    }
  } catch {
    /* optional */
  }
  return { apiUrl, anon, service };
}

async function signIn(apiUrl, anon, email, password = "Test1234!") {
  const res = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!body.access_token || !body.user?.id) {
    throw new Error(`sign-in failed for ${email}`);
  }
  return { token: body.access_token, userId: body.user.id };
}

async function live() {
  const { apiUrl, anon, service } = loadLocalSupabaseEnv();
  if (!apiUrl || !anon || !service) {
    console.log("⏭️  Skipping live DB checks (no local Supabase env)");
    return;
  }

  const admin = createClient(apiUrl, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // BEFORE-style broken select must not be what we ship; AFTER must work.
  const broken = await admin
    .from("requests")
    .select("id, archived_at, trashed_at")
    .limit(1);
  if (broken.error && /archived_at|trashed_at/i.test(broken.error.message)) {
    throw new Error(
      `Migration 039 not applied (column missing): ${broken.error.message}`
    );
  }

  const customerAuth = await signIn(apiUrl, anon, "customer@test.look");
  const providerAuth = await signIn(apiUrl, anon, "provider@test.look");

  const customer = createClient(apiUrl, anon, {
    global: { headers: { Authorization: `Bearer ${customerAuth.token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const provider = createClient(apiUrl, anon, {
    global: { headers: { Authorization: `Bearer ${providerAuth.token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Auth/profile ID match
  const { data: custProfile } = await customer
    .from("profiles")
    .select("id, role")
    .eq("id", customerAuth.userId)
    .maybeSingle();
  assert.equal(custProfile?.id, customerAuth.userId);

  // AFTER query (mirrors listCustomerOrderHistory All tab)
  const customerAll = await customer
    .from("requests")
    .select(
      "id, customer_id, title, status, archived_at, trashed_at, customer:profiles!requests_customer_id_fkey(id, full_name), category:categories(id, name)",
      { count: "exact" }
    )
    .eq("customer_id", customerAuth.userId)
    .is("trashed_at", null)
    .order("created_at", { ascending: false });

  assert.ok(!customerAll.error, customerAll.error?.message);
  assert.ok((customerAll.count ?? 0) > 0, "customer All empty");
  assert.ok(
    (customerAll.data ?? []).every((r) => r.customer_id === customerAuth.userId)
  );

  // Spoof other customer_id under RLS → 0
  const spoof = await customer
    .from("requests")
    .select("id", { count: "exact" })
    .eq("customer_id", providerAuth.userId);
  assert.equal(spoof.count ?? 0, 0);

  const providerOffers = await provider
    .from("offers")
    .select("id, request_id, status", { count: "exact" })
    .eq("provider_id", providerAuth.userId);
  assert.ok(!providerOffers.error, providerOffers.error?.message);
  assert.ok((providerOffers.count ?? 0) > 0, "provider offers empty");

  const requestIds = [
    ...new Set((providerOffers.data ?? []).map((o) => o.request_id)),
  ];
  const providerReqs = await provider
    .from("requests")
    .select("id, title, status, archived_at, trashed_at")
    .in("id", requestIds)
    .is("trashed_at", null);
  assert.ok(!providerReqs.error, providerReqs.error?.message);
  assert.ok((providerReqs.data ?? []).length > 0, "provider requests empty");

  const adminAll = await admin
    .from("requests")
    .select("id", { count: "exact", head: true })
    .is("trashed_at", null);
  assert.ok((adminAll.count ?? 0) > 0, "admin All empty");

  // Pagination slice
  const page = await customer
    .from("requests")
    .select("id", { count: "exact" })
    .eq("customer_id", customerAuth.userId)
    .is("trashed_at", null)
    .order("created_at", { ascending: false })
    .range(0, 1);
  assert.ok((page.data ?? []).length <= 2);
  assert.equal(page.count, customerAll.count);

  const summary = {
    beforeQuery:
      "select … archived_at, trashed_at … & trashed_at=is.null  → 42703 column requests.archived_at does not exist (empty UI)",
    afterQuery:
      "same select after migration 039 + .eq(customer_id, auth.uid) + trashed_at IS NULL",
    counts: {
      customer: customerAll.count,
      providerOffers: providerOffers.count,
      providerRequests: providerReqs.data?.length ?? 0,
      admin: adminAll.count,
    },
    auth: {
      customerUserId: customerAuth.userId,
      customerProfileId: custProfile?.id,
      providerUserId: providerAuth.userId,
      idsMatch: custProfile?.id === customerAuth.userId,
    },
  };
  console.log(JSON.stringify(summary, null, 2));
  console.log("✅ live order history loading checks passed");
}

live().catch((e) => {
  console.error(e);
  process.exit(1);
});
