#!/usr/bin/env node
/**
 * Verify register page EN locale on production (no Russian UI strings on step 2).
 */
const BASE = process.env.LOOK_PRODUCTION_URL || "https://lookcruise.com";

const RU_MARKERS = [
  "Телефон",
  "Страна",
  "Город",
  "Россия",
  "Москва",
  "Минимум 6",
  "Введите корректный",
  "Фото профиля",
  "Ссылка на изображение",
  "Я принимаю",
  "Необходимо принять",
  "Полное имя",
  "Электронная почта",
  "Далее",
  "Назад",
];

const EN_EXPECTED = [
  "Phone",
  "Country",
  "City",
  "Profile photo (URL)",
  "Image URL for avatar",
  "Full name",
  "Next",
];

async function main() {
  const { chromium } = await import("playwright");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "look_locale",
      value: "en",
      domain: "lookcruise.com",
      path: "/",
    },
  ]);
  const page = await context.newPage();
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });

  await page.getByRole("button", { name: /customer|заказчик/i }).click().catch(() => {});
  await page.getByRole("button", { name: /^next$|^далее$/i }).click();

  await page.waitForTimeout(500);
  const text = await page.locator("form").innerText();

  let failed = 0;
  for (const ru of RU_MARKERS) {
    if (text.includes(ru)) {
      console.error(`❌ Found Russian: "${ru}"`);
      failed++;
    }
  }
  for (const en of EN_EXPECTED) {
    if (!text.includes(en)) {
      console.error(`❌ Missing English: "${en}"`);
      failed++;
    }
  }

  await browser.close();
  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("✅ Register step 2 is fully English on production");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
