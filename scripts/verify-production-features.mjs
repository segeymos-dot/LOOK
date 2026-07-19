#!/usr/bin/env node
/**
 * Production verification for lookcruise.com (HTTP smoke checks).
 * Does not mutate production data by default.
 *
 * Optional:
 *   RUN_LIFECYCLE=1 — also run scripts/verify-work-lifecycle.mjs (uses .env.local Supabase)
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.LOOK_PRODUCTION_URL || "https://lookcruise.com";

function loadEnv() {
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[t.slice(0, i).trim()] = v;
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const adminEmail = env.NEXT_PUBLIC_TEST_ADMIN_EMAIL || "admin@test.look";
const adminPassword = env.NEXT_PUBLIC_TEST_ADMIN_PASSWORD || "Test1234!";

let failed = 0;
function pass(msg) {
  console.log(`✅ ${msg}`);
}
function fail(msg, detail = "") {
  console.error(`❌ ${msg}${detail ? ` — ${detail}` : ""}`);
  failed++;
}
function warn(msg) {
  console.warn(`⚠️  ${msg}`);
}

async function signInViaApi(email, password) {
  const res = await fetch(`${BASE}/api/auth/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || "sign-in failed");
  return data.session;
}

async function main() {
  console.log(`Production verification: ${BASE}\n`);

  if (BASE.includes("localhost") || BASE.includes("127.0.0.1")) {
    fail("LOOK_PRODUCTION_URL must be a public production URL", BASE);
  }

  const visit1 = await fetch(`${BASE}/api/analytics/visit`, { method: "POST" });
  const visit2 = await fetch(`${BASE}/api/analytics/visit`, { method: "POST" });
  if (visit1.ok && visit2.ok) pass("Visit tracker API responds");
  else fail("Visit tracker API", `${visit1.status}/${visit2.status}`);

  const homeHtml = await fetch(BASE).then((r) => r.text());
  if (/LOOK|lookcruise/i.test(homeHtml)) pass("Home page renders brand content");
  else fail("Home page brand content missing");

  const loginRes = await fetch(`${BASE}/login`);
  const loginHtml = await loginRes.text();
  if (loginRes.ok && (/login|sign.?in|войти/i.test(loginHtml) || loginHtml.length > 200)) {
    pass("Login page loads");
  } else {
    fail("Login page", String(loginRes.status));
  }

  if (!supabaseUrl || !anonKey) {
    warn("Supabase env missing locally — skipping admin API checks");
  } else {
    try {
      const session = await signInViaApi(adminEmail, adminPassword);
      const statsRes = await fetch(`${BASE}/api/analytics/stats`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
        },
      });
      if (statsRes.ok) {
        const { stats } = await statsRes.json();
        pass(
          `Admin stats API: views=${stats.pageViews}, unique=${stats.uniqueVisitors}, registrations=${stats.registrations}, orders=${stats.ordersCreated}`
        );
        if (
          typeof stats.pageViews !== "number" ||
          typeof stats.registrations !== "number"
        ) {
          fail("Admin stats payload shape unexpected");
        }
      } else {
        const body = await statsRes.text();
        fail("Admin stats API", `${statsRes.status} ${body.slice(0, 120)}`);
      }
    } catch (e) {
      fail("Admin session tests", e instanceof Error ? e.message : String(e));
    }
  }

  if (process.env.RUN_LIFECYCLE === "1") {
    const lifecycle = spawnSync("node", ["scripts/verify-work-lifecycle.mjs"], {
      cwd: root,
      encoding: "utf8",
    });
    if (lifecycle.status === 0) pass("Full order lifecycle");
    else {
      fail(
        "Full order lifecycle",
        lifecycle.stderr?.slice(0, 200) || lifecycle.stdout?.slice(-200)
      );
    }
  } else {
    warn("Skipped lifecycle mutation (set RUN_LIFECYCLE=1 to enable)");
  }

  console.log(failed ? `\n${failed} check(s) failed.` : "\nAll production checks passed.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
