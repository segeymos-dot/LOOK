#!/usr/bin/env node
/**
 * Static + staging checks for lifecycle banner copy keys.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function isPaid(payment) {
  return payment === "paid" || payment === "completed";
}

function getKey({ requestStatus, orderPaymentStatus, viewer }) {
  const paid = isPaid(orderPaymentStatus);
  if (
    requestStatus === "completed" ||
    requestStatus === "cancelled" ||
    requestStatus === "open"
  ) {
    return null;
  }
  if (requestStatus === "pending_review") {
    return viewer === "customer"
      ? "request.pendingReviewCustomer"
      : "request.pendingReviewProvider";
  }
  if (requestStatus === "in_progress") {
    if (viewer === "customer") {
      return paid
        ? "request.inProgressCustomerPaid"
        : "request.inProgressCustomer";
    }
    return paid
      ? "request.inProgressProviderPaid"
      : "request.inProgressProvider";
  }
  return null;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const cases = [
  {
    name: "completed hides banner",
    input: {
      requestStatus: "completed",
      orderPaymentStatus: "paid",
      viewer: "customer",
    },
    expect: null,
  },
  {
    name: "in_progress unpaid mentions pay path",
    input: {
      requestStatus: "in_progress",
      orderPaymentStatus: "unpaid",
      viewer: "customer",
    },
    expect: "request.inProgressCustomer",
  },
  {
    name: "in_progress paid no pay CTA",
    input: {
      requestStatus: "in_progress",
      orderPaymentStatus: "paid",
      viewer: "customer",
    },
    expect: "request.inProgressCustomerPaid",
  },
  {
    name: "pending_review customer",
    input: {
      requestStatus: "pending_review",
      orderPaymentStatus: "paid",
      viewer: "customer",
    },
    expect: "request.pendingReviewCustomer",
  },
];

for (const c of cases) {
  const got = getKey(c.input);
  assert(got === c.expect, `${c.name}: expected ${c.expect}, got ${got}`);
}

const ru = readFileSync(resolve("src/lib/i18n/locales/ru.ts"), "utf8");
assert(
  ru.includes('inProgressCustomerPaid: "Заказ оплачен'),
  "missing RU paid in-progress copy"
);
assert(
  !ru.includes('inProgressCustomerPaid: "Заказ в работе'),
  "paid copy must not say in progress unpaid phrasing"
);
const paidCopy = ru.match(
  /inProgressCustomerPaid:\s*"([^"]+)"/
)?.[1];
assert(paidCopy, "paid copy missing");
assert(!/оплатит|оплатить/.test(paidCopy), `paid copy still mentions pay: ${paidCopy}`);
assert(!/в работе/.test(paidCopy) || /оплачен/.test(paidCopy), "unexpected paid copy");

const env = {
  ...loadEnvFile(resolve(".env.staging.local")),
  ...process.env,
};
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && service, "staging env missing");

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: rows, error } = await admin
  .from("requests")
  .select("id, title, status, order_payment_status, order_amount")
  .ilike("title", "%заказ теста%")
  .order("created_at", { ascending: false })
  .limit(5);

assert(!error, error?.message ?? "query failed");
const target = (rows ?? []).find((r) => r.status === "completed");
assert(target, "staging completed «заказ теста» not found");
assert(
  target.order_payment_status === "paid" ||
    target.order_payment_status === "completed",
  `payment=${target.order_payment_status}`
);
assert(
  Number(target.order_amount) === 700 || Number(target.order_amount) > 0,
  `amount unexpected: ${target.order_amount}`
);
assert(
  getKey({
    requestStatus: target.status,
    orderPaymentStatus: target.order_payment_status,
    viewer: "customer",
  }) === null,
  "completed order must hide green lifecycle plaque"
);

const { data: previous } = await admin
  .from("requests")
  .select("id, title, status, order_payment_status")
  .eq("status", "completed")
  .order("updated_at", { ascending: false })
  .limit(5);

for (const row of previous ?? []) {
  assert(
    getKey({
      requestStatus: row.status,
      orderPaymentStatus: row.order_payment_status,
      viewer: "customer",
    }) === null,
    `regression: completed ${row.title} still gets banner`
  );
}

console.log(
  JSON.stringify(
    {
      result: "PASS",
      zakazTesta: {
        id: target.id,
        status: target.status,
        payment: target.order_payment_status,
        amount: target.order_amount,
        bannerKey: null,
      },
      completedChecked: (previous ?? []).length,
    },
    null,
    2
  )
);
