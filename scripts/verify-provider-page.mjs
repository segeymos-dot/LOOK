#!/usr/bin/env node
/**
 * Verify public provider page renders expected content.
 * Usage: node scripts/verify-provider-page.mjs [id] [baseUrl]
 */
const id = process.argv[2] ?? "user-2";
const base = process.argv[3] ?? "http://localhost:3000";
const url = `${base}/providers/${id}`;

const required = [
  "Дмитрий",
  "4.9",
  "Навыки",
  "Портфолио",
  "Отзывы",
  "Написать",
  "Предложить заказ",
  "Ремонт",
];

async function main() {
  const res = await fetch(url);
  const html = await res.text();
  const missing = required.filter((s) => !html.includes(s));

  console.log(`URL: ${url}`);
  console.log(`HTTP: ${res.status}`);
  console.log(`Length: ${html.length} bytes`);

  if (res.status !== 200) {
    console.error("FAIL: expected HTTP 200");
    process.exit(1);
  }

  if (missing.length) {
    console.error("FAIL: missing content:", missing.join(", "));
    process.exit(1);
  }

  console.log("OK: all required content present");
  required.forEach((s) => console.log(`  ✓ ${s}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
