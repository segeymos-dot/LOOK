/**
 * Mobile navigation performance audit against production.
 * Measures RSC/document timings + optional client SPA transitions when cookies present.
 *
 * Usage: node scripts/audit-mobile-nav-perf.mjs
 */
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.LOOK_PERF_BASE || "https://lookcruise.com";
const MOBILE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  isMobile: true,
  hasTouch: true,
};

const browserPath = resolve(
  process.cwd(),
  ".pw-browsers/chromium_headless_shell-1148/chrome-mac/headless_shell"
);

function ms(n) {
  return Math.round(n);
}

async function withLatency(page, latencyMs) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: (1.5 * 1024 * 1024) / 8, // ~1.5 Mbps
    uploadThroughput: (750 * 1024) / 8,
    latency: latencyMs,
  });
  return cdp;
}

async function measureDocument(page, path) {
  const started = Date.now();
  const responses = [];
  const onResp = async (res) => {
    const url = res.url();
    if (!url.includes(BASE) && !url.includes("supabase")) return;
    const type = res.request().resourceType();
    if (!["document", "fetch", "xhr"].includes(type)) return;
    responses.push({
      url: url.replace(BASE, "").slice(0, 120),
      status: res.status(),
      type,
      timing: Date.now() - started,
    });
  };
  page.on("response", onResp);

  const navStart = Date.now();
  const response = await page.goto(`${BASE}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  const dcl = Date.now() - navStart;

  await page.waitForTimeout(800);
  const interactive = Date.now() - navStart;

  const paint = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find((p) => p.name === "first-contentful-paint");
    return {
      ttfb: nav?.responseStart ?? null,
      domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
      load: nav?.loadEventEnd ?? null,
      fcp: fcp?.startTime ?? null,
    };
  });

  page.off("response", onResp);

  // Deduplicate API-ish calls
  const apiish = responses.filter(
    (r) =>
      r.type !== "document" &&
      (r.url.includes("/api/") ||
        r.url.includes("supabase") ||
        r.url.includes("auth"))
  );

  return {
    path,
    status: response?.status() ?? 0,
    navStartToDclMs: ms(dcl),
    navStartToInteractiveMs: ms(interactive),
    ttfbMs: paint.ttfb != null ? ms(paint.ttfb) : null,
    fcpMs: paint.fcp != null ? ms(paint.fcp) : null,
    apiCalls: apiish.slice(0, 40),
    apiCount: apiish.length,
  };
}

async function measureSpaClick(page, fromPath, clickSelector, waitForPath) {
  await page.goto(`${BASE}${fromPath}`, {
    waitUntil: "networkidle",
    timeout: 45000,
  });
  await page.waitForTimeout(500);

  const responses = [];
  const started = Date.now();
  page.on("response", (res) => {
    const url = res.url();
    const type = res.request().resourceType();
    if (!["document", "fetch", "xhr"].includes(type)) return;
    if (!url.includes(BASE) && !url.includes("supabase")) return;
    responses.push({
      url: url.replace(BASE, "").slice(0, 140),
      type,
      at: Date.now() - started,
    });
  });

  const clickable = page.locator(clickSelector).first();
  const count = await clickable.count();
  if (!count) {
    return { ok: false, reason: `selector not found: ${clickSelector}` };
  }

  const navStart = Date.now();
  await Promise.all([
    page.waitForURL((u) => u.pathname.includes(waitForPath), { timeout: 30000 }),
    clickable.click({ timeout: 10000 }),
  ]);
  const urlChange = Date.now() - navStart;

  // first meaningful paint-ish: wait for body content change
  await page.waitForTimeout(200);
  const firstPaintish = Date.now() - navStart;
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  const interactive = Date.now() - navStart;

  return {
    ok: true,
    fromPath,
    waitForPath,
    urlChangeMs: ms(urlChange),
    firstPaintishMs: ms(firstPaintish),
    interactiveMs: ms(interactive),
    apiCalls: responses.filter((r) => r.type !== "document").slice(0, 30),
  };
}

async function findPublicRequestId(page) {
  // Try search page RSC/HTML for a request link
  await page.goto(`${BASE}/search`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  const href = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/requests/"]');
    return a?.getAttribute("href") || null;
  });
  if (href) {
    const m = href.match(/\/requests\/([0-9a-f-]{36})/i);
    if (m) return m[1];
  }
  return null;
}

async function runSuite(label, latencyMs) {
  const browser = await chromium.launch({
    executablePath: existsSync(browserPath) ? browserPath : undefined,
    headless: true,
  });
  const context = await browser.newContext({
    ...MOBILE,
    locale: "en-US",
  });
  const page = await context.newPage();
  if (latencyMs > 0) await withLatency(page, latencyMs);

  const cold = {};
  for (const path of ["/", "/profile", "/search", "/profile/payments"]) {
    cold[path] = await measureDocument(page, path);
  }

  const requestId = await findPublicRequestId(page);
  let order = null;
  let chat = null;
  if (requestId) {
    order = await measureDocument(page, `/requests/${requestId}`);
    // Find chat link on order page (may require auth — best effort)
    await page.goto(`${BASE}/requests/${requestId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(1000);
    const chatHref = await page.evaluate(() => {
      const a = document.querySelector('a[href^="/chat/"]');
      return a?.getAttribute("href") || null;
    });
    if (chatHref) {
      chat = await measureDocument(page, chatHref);
    }
  }

  // SPA-ish transitions via bottom nav Links (guest)
  const homeToProfile = await measureSpaClick(
    page,
    "/",
    'a[href="/profile"]',
    "/profile"
  );
  const profileToPayments = await measureSpaClick(
    page,
    "/profile",
    'a[href="/profile/payments"]',
    "/profile/payments"
  );

  let searchToOrder = { ok: false, reason: "no request id" };
  if (requestId) {
    searchToOrder = await measureSpaClick(
      page,
      "/search",
      `a[href="/requests/${requestId}"]`,
      `/requests/${requestId}`
    );
  }

  await browser.close();

  return {
    label,
    latencyMs,
    requestId,
    cold,
    order,
    chat,
    spa: { homeToProfile, searchToOrder, profileToPayments },
  };
}

const normal = await runSuite("normal", 0);
const throttled = await runSuite("throttled-250ms", 250);

console.log(
  JSON.stringify(
    {
      base: BASE,
      measuredAt: new Date().toISOString(),
      normal,
      throttled,
    },
    null,
    2
  )
);
