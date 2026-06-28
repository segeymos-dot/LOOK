#!/usr/bin/env node
/**
 * Production verification for lookcruise.com
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let failed = 0;
function pass(msg) {
  console.log(`✅ ${msg}`);
}
function fail(msg, detail = "") {
  console.error(`❌ ${msg}${detail ? ` — ${detail}` : ""}`);
  failed++;
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

  const visit1 = await fetch(`${BASE}/api/analytics/visit`, { method: "POST" });
  const visit2 = await fetch(`${BASE}/api/analytics/visit`, { method: "POST" });
  if (visit1.ok && visit2.ok) pass("Visit tracker API responds");
  else fail("Visit tracker API", `${visit1.status}/${visit2.status}`);

  const loginHtml = await fetch(`${BASE}/login`).then((r) => r.text());
  if (loginHtml.includes("LocaleProvider")) pass("i18n provider on login");
  else fail("i18n provider on login");

  const homeHtml = await fetch(BASE).then((r) => r.text());
  if (homeHtml.includes("LocaleProvider")) pass("i18n provider on home");
  else fail("i18n provider on home");

  if (!supabaseUrl || !anonKey) {
    fail("Supabase env missing for admin tests");
  } else {
    try {
      const session = await signInViaApi("admin@test.look", "Test1234!");
      const statsRes = await fetch(`${BASE}/api/analytics/stats`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
        },
      });
      if (statsRes.ok) {
        const { stats } = await statsRes.json();
        pass(
          `Admin stats: views=${stats.pageViews}, unique=${stats.uniqueVisitors}, registrations=${stats.registrations}, orders=${stats.ordersCreated}, offers=${stats.offersCreated}, completed=${stats.ordersCompleted}`
        );
        if (stats.registrations > 0) pass("Registrations counter");
        else fail("Registrations counter is zero");
        if (stats.ordersCreated > 0) pass("Orders created counter");
        else fail("Orders created counter is zero");
        if (stats.offersCreated > 0) pass("Offers counter");
        else fail("Offers counter is zero");
      } else {
        const body = await statsRes.text();
        fail("Admin stats API", `${statsRes.status} ${body.slice(0, 120)}`);
      }

      const adminPage = await fetch(`${BASE}/admin/stats`, {
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: anonKey },
      });
      if (adminPage.ok && (await adminPage.text()).includes("statsTitle")) {
        pass("Admin stats page renders");
      } else if (adminPage.ok) {
        pass("Admin stats page loads");
      } else {
        fail("Admin stats page", String(adminPage.status));
      }
    } catch (e) {
      fail("Admin session tests", e.message);
    }
  }

  const lifecycle = await import("node:child_process").then(({ spawnSync }) =>
    spawnSync("node", ["scripts/verify-work-lifecycle.mjs"], {
      cwd: root,
      encoding: "utf8",
    })
  );
  if (lifecycle.status === 0) pass("Full order lifecycle");
  else fail("Full order lifecycle", lifecycle.stderr?.slice(0, 200) || lifecycle.stdout?.slice(-200));

  console.log(failed ? `\n${failed} check(s) failed.` : "\nAll production checks passed.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
