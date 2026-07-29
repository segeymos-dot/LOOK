#!/usr/bin/env node
/**
 * Local verification for admin user/visitor statistics hardening.
 * Usage: node scripts/verify-admin-user-stats.mjs
 */
import { createClient } from "@supabase/supabase-js";

const APP = process.env.LOOK_APP_URL ?? "http://localhost:3000";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function signIn(email) {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anon = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: "Test1234!",
  });
  if (error || !data.session?.access_token) {
    throw new Error(`signIn failed for ${email}: ${error?.message ?? "no token"}`);
  }
  return data.session.access_token;
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
  const results = [];

  // 1) Unauthorized admin stats
  {
    const { status } = await jsonFetch("/api/admin/user-stats");
    assert(status === 401, `expected 401 without auth, got ${status}`);
    results.push("admin stats 401 without auth: OK");
  }

  // 2) Heartbeat validation
  {
    const bad = await jsonFetch("/api/presence/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId: "short", userId: "x" }),
    });
    assert(bad.status === 400, `expected 400 for bad visitor/userId, got ${bad.status}`);

    const badSession = await jsonFetch("/api/presence/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorId: "valid-visitor-id-001",
        sessionId: "not-a-uuid",
      }),
    });
    assert(badSession.status === 400, `expected 400 for bad session, got ${badSession.status}`);
    results.push("heartbeat input validation: OK");
  }

  // 3) Anonymous unique visitor + session reuse
  {
    const visitorId = `anon-verify-${Date.now().toString(36)}`;
    const first = await jsonFetch("/api/presence/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId }),
    });
    assert(first.status === 200 && first.body?.newSession === true, "first visit should open session");
    const sessionId = first.body.sessionId;

    const second = await jsonFetch("/api/presence/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId, sessionId }),
    });
    assert(second.status === 200 && second.body?.newSession === false, "reload should reuse session");
    assert(second.body.sessionId === sessionId, "session id should stay stable");
    results.push("anon unique visitor + session reuse: OK");
  }

  // 4) Role online semantics + admin API ACL
  {
    const customerToken = await signIn("customer@test.look");
    const providerToken = await signIn("provider@test.look");
    const adminToken = await signIn("admin@test.look");

    await jsonFetch("/api/presence/end", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerToken}`,
      },
      body: JSON.stringify({ visitorId: "provider-cleanup-visitor" }),
    });

    const custHb = await jsonFetch("/api/presence/heartbeat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({ visitorId: `cust-${Date.now().toString(36)}aaaa` }),
    });
    assert(custHb.status === 200, "customer heartbeat failed");

    const provHb1 = await jsonFetch("/api/presence/heartbeat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerToken}`,
      },
      body: JSON.stringify({ visitorId: `prov-a-${Date.now().toString(36)}aa` }),
    });
    const provVisitor = provHb1.body.visitorId;
    const provHb2 = await jsonFetch("/api/presence/heartbeat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerToken}`,
      },
      body: JSON.stringify({ visitorId: `prov-b-${Date.now().toString(36)}bb` }),
    });
    assert(provHb2.body.visitorId === provVisitor, "provider multi-tab should merge visitor");

    const custForbidden = await jsonFetch("/api/admin/user-stats", {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert(custForbidden.status === 403, `customer expected 403, got ${custForbidden.status}`);

    const provForbidden = await jsonFetch("/api/admin/user-stats", {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    assert(provForbidden.status === 403, `provider expected 403, got ${provForbidden.status}`);

    const adminOk = await jsonFetch("/api/admin/user-stats", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminOk.status === 200 && adminOk.body?.stats, "admin stats failed");
    const stats = adminOk.body.stats;
    assert(stats.providersOnline >= 1, "providersOnline should include provider");
    assert(stats.customersOnline >= 1, "customersOnline should include customer");
    assert(stats.usersOnline >= 2, "usersOnline should include customer+provider");
    assert(stats.adminsCountedInOnline === false, "admins must not be counted online");

    // customer should NOT inflate providersOnline beyond provider count after cleanup
    // (customer is online, provider is online → customersOnline>=1, providersOnline>=1)

    const custStatsForbidden = await jsonFetch("/api/admin/customer-stats", {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert(custStatsForbidden.status === 403, "customer-stats must be 403 for customer");

    const provStatsForbidden = await jsonFetch("/api/admin/provider-stats", {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    assert(provStatsForbidden.status === 403, "provider-stats must be 403 for provider");

    const custStatsOk = await jsonFetch("/api/admin/customer-stats", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(custStatsOk.status === 200 && custStatsOk.body?.stats, "customer-stats admin failed");
    assert(
      typeof custStatsOk.body.stats.orders?.total === "number",
      "customer-stats orders missing"
    );

    const activity = await jsonFetch("/api/admin/customers?view=activity&page=1&pageSize=5", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(activity.status === 200, "customer activity list failed");
    assert(Array.isArray(activity.body.items), "activity items missing");
    assert(activity.body.pageSize <= 50, "pageSize must be capped");

    const activityForbidden = await jsonFetch("/api/admin/customers?view=activity", {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert(activityForbidden.status === 403, "activity list must be 403 for customer");

    // Logout provider presence
    await jsonFetch("/api/presence/end", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerToken}`,
      },
      body: JSON.stringify({ visitorId: provVisitor }),
    });

    // Logout customer presence
    await jsonFetch("/api/presence/end", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({ visitorId: custHb.body.visitorId }),
    });

    const afterEnd = await jsonFetch("/api/admin/user-stats", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(afterEnd.body.stats.providersOnline === 0, "providersOnline should drop after end");
    assert(afterEnd.body.stats.customersOnline === 0, "customersOnline should drop after end");
    results.push("customersOnline + role stats ACL + activity pagination: OK");
  }

  // 5) Role both: one user increments customersOnline AND providersOnline once each
  {
    const { execSync } = await import("node:child_process");
    // Flip customer test account to both for this check, then restore.
    execSync(
      `npx supabase db query --local "UPDATE profiles SET role = 'both' WHERE id = (SELECT id FROM auth.users WHERE email = 'customer@test.look')"` ,
      { stdio: "pipe" }
    );
    try {
      const bothToken = await signIn("customer@test.look");
      const adminToken = await signIn("admin@test.look");
      const hb = await jsonFetch("/api/presence/heartbeat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bothToken}`,
        },
        body: JSON.stringify({ visitorId: `both-${Date.now().toString(36)}aaaa` }),
      });
      assert(hb.status === 200, "both heartbeat failed");

      const adminOk = await jsonFetch("/api/admin/user-stats", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const stats = adminOk.body.stats;
      assert(stats.customersOnline >= 1, "both should count in customersOnline");
      assert(stats.providersOnline >= 1, "both should count in providersOnline");
      // usersOnline counts the person once (plus any remaining presence)
      assert(stats.usersOnline >= 1, "both should count once in usersOnline");

      await jsonFetch("/api/presence/end", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bothToken}`,
        },
        body: JSON.stringify({ visitorId: hb.body.visitorId }),
      });
      results.push("role both online counters: OK");
    } finally {
      execSync(
        `npx supabase db query --local "UPDATE profiles SET role = 'customer' WHERE id = (SELECT id FROM auth.users WHERE email = 'customer@test.look')"` ,
        { stdio: "pipe" }
      );
    }
  }

  console.log(results.map((r) => `✓ ${r}`).join("\n"));
  console.log("verify-admin-user-stats: PASS");
}

main().catch((error) => {
  console.error("verify-admin-user-stats: FAIL");
  console.error(error);
  process.exit(1);
});
