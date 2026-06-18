import { chromium } from "playwright";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const CHROME =
  "/var/folders/xq/j6dlh8714pvbcdn4301tlgtr0000gn/T/cursor-sandbox-cache/f808ec42872407820a781d2bfb2fcac7/playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

async function checkPage(page, path, label) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4000);

  const bodyText = await page.locator("body").innerText();
  const hasLoading = /Загрузка/.test(bodyText);

  console.log(`\n=== ${label} (${path}) ===`);
  console.log(`has "Загрузка": ${hasLoading}`);
  console.log(`preview: ${bodyText.slice(0, 500).replace(/\n/g, " | ")}`);

  return { label, hasLoading };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
  });
  const page = await browser.newPage();

  page.on("pageerror", (err) => console.log(`[page error] ${err.message}`));

  const results = [];
  results.push(await checkPage(page, "/", "Home"));
  results.push(await checkPage(page, "/search", "Search"));
  results.push(await checkPage(page, "/profile", "Profile guest (may redirect)"));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const testBtn = page.getByRole("button", { name: "Заказчик" });
  if (await testBtn.count()) {
    await testBtn.click();
    await page.waitForURL(/\/(profile|$)/, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    results.push(await checkPage(page, page.url().replace(BASE, "") || "/", "After test login"));
    results.push(await checkPage(page, "/profile", "Profile logged in"));
    results.push(await checkPage(page, "/", "Home logged in"));
    results.push(await checkPage(page, "/search", "Search logged in"));
  } else {
    console.log("\nTest login button not found");
  }

  await browser.close();

  const stuck = results.filter((r) => r.hasLoading);
  console.log(`\nChecked ${results.length} views, stuck: ${stuck.length}`);
  if (stuck.length) {
    stuck.forEach((r) => console.log(`- ${r.label}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
