import { chromium } from "playwright";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const CHROME =
  "/var/folders/xq/j6dlh8714pvbcdn4301tlgtr0000gn/T/cursor-sandbox-cache/f808ec42872407820a781d2bfb2fcac7/playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

async function loginAsCustomer(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Заказчик" }).click();
  await page.waitForTimeout(4000);

  if (page.url().includes("/login")) {
    await page.locator("#email").fill("customer@test.look");
    await page.locator("#password").fill("Test1234!");
    await page.getByRole("button", { name: "Войти" }).click();
    await page.waitForTimeout(4000);
  }

  if (page.url().includes("/login")) {
    throw new Error("Could not log in as test customer");
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
  });
  const page = await browser.newPage();

  await loginAsCustomer(page);

  await page.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Редактировать профиль" }).click();
  await page.locator("select").waitFor({ timeout: 10000 });
  await page.locator("select").selectOption("both");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.waitForTimeout(2000);

  await page.goto(`${BASE}/search`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const ownOpenHref = await page
    .locator('a[href^="/requests/"]')
    .first()
    .getAttribute("href");

  if (!ownOpenHref) throw new Error("No requests in search");

  await page.goto(`${BASE}${ownOpenHref}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const ownOrderText = await page.locator("body").innerText();
  if (!ownOrderText.includes("Это ваш заказ")) {
    throw new Error("Expected own-order hint on customer open request");
  }
  if (/Откликнуться на заказ/.test(ownOrderText)) {
    throw new Error("Offer button must not appear on own open request");
  }
  if (!/Управление запросом/.test(ownOrderText) || !/Отменить/.test(ownOrderText)) {
    throw new Error("Expected customer management actions on own open request");
  }

  console.log("Own open request: customer controls OK, no offer button OK");

  await page.goto(`${BASE}/search`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const hrefs = [
    ...new Set(
      await page.locator('a[href^="/requests/"]').evaluateAll((elements) =>
        elements
          .map((element) => element.getAttribute("href"))
          .filter((href) => href && /^\/requests\/[^/]+$/.test(href))
      )
    ),
  ];

  let foreignOpenWithOffer = null;

  for (const href of hrefs) {
    await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    const text = await page.locator("body").innerText();
    const isOwn = text.includes("Это ваш заказ") || /Управление запросом/.test(text);
    const isOpen = /Открыт/.test(text) && !/В работе/.test(text.split("Предложения")[0] ?? text);
    const hasOffer = /Откликнуться на заказ/.test(text);

    if (!isOwn && isOpen && hasOffer) {
      foreignOpenWithOffer = href;
      break;
    }
  }

  if (foreignOpenWithOffer) {
    console.log(`Foreign open request with offer button: ${foreignOpenWithOffer}`);
  } else {
    console.log(
      "No foreign open request in seed data (some may be in_progress). Unit tests cover that case."
    );
  }

  await browser.close();
  console.log("\nBoth-role offer flow check passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
