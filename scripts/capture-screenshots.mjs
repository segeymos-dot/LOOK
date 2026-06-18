/**
 * Capture UI screenshots for modernization report.
 * Run: node scripts/capture-screenshots.mjs
 * Requires dev server on :3000
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = "http://localhost:3000";
const OUT = join(process.cwd(), "docs/screenshots");

async function resolveProviderPath() {
  const env = {};
  try {
    const { readFileSync, existsSync } = await import("node:fs");
    if (existsSync(".env.local")) {
      readFileSync(".env.local", "utf8")
        .split("\n")
        .forEach((line) => {
          const t = line.trim();
          if (!t || t.startsWith("#")) return;
          const i = t.indexOf("=");
          if (i === -1) return;
          env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
        });
    }
  } catch {
    /* ignore */
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return "/providers/user-2";

  const res = await fetch(
    `${url}/rest/v1/profiles?select=id&role=eq.provider&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  const data = await res.json();
  if (Array.isArray(data) && data[0]?.id) return `/providers/${data[0].id}`;
  return "/providers/user-2";
}

async function getPages() {
  const providerPath = await resolveProviderPath();
  return [
    { name: "01-home", path: "/" },
    { name: "02-search", path: "/search" },
    { name: "03-login", path: "/login" },
    { name: "04-register", path: "/register" },
    { name: "05-profile", path: "/profile" },
    { name: "06-new-request", path: "/requests/new" },
    { name: "07-chat", path: "/chat" },
    { name: "08-my-requests", path: "/my/requests" },
    { name: "09-my-offers", path: "/my/offers" },
    { name: "10-provider", path: providerPath },
  ];
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.log("Playwright not installed. Install with: npm i -D playwright && npx playwright install chromium");
    process.exit(0);
  }

  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const manifest = [];

  const pages = await getPages();

  for (const { name, path } of pages) {
    const url = `${BASE}${path}`;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(800);
      const file = join(OUT, `${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      manifest.push({ name, path, file: `docs/screenshots/${name}.png` });
      console.log(`✓ ${name}`);
    } catch (err) {
      console.log(`✗ ${name}: ${err.message}`);
    }
  }

  await browser.close();
  await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nSaved ${manifest.length} screenshots to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
