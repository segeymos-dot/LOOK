#!/usr/bin/env node
/**
 * Minimal LOOK Staging scenario seed (idempotent).
 * Uses .env.staging.local only — never Production / .env.local.
 *
 * Creates:
 *   1 open request from customer@test.look (category: repair)
 *   1 pending offer from provider@test.look
 * No payments. Never prints secrets or passwords.
 *
 * Usage: node scripts/seed-staging-scenario.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stagingEnvPath = resolve(root, ".env.staging.local");
const localEnvPath = resolve(root, ".env.local");

const CUSTOMER_EMAIL = "customer@test.look";
const PROVIDER_EMAIL = "provider@test.look";
const CATEGORY_SLUG = "repair";
const CATEGORY_NAME = "Ремонт и строительство";

const REQUEST_TITLE = "[STAGING SEED] Ремонт — тестовый заказ";
const REQUEST_DESCRIPTION =
  "Идемпотентный тестовый заказ LOOK Staging: мелкий ремонт для проверки сценария customer → provider offer. Без оплаты.";
const OFFER_MESSAGE =
  "[STAGING SEED] Тестовое предложение на заказ по ремонту. Без оплаты.";

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = value;
  }
  return out;
}

function projectRefFromUrl(url) {
  return new URL(url).hostname.split(".")[0];
}

function redact(msg) {
  return String(msg)
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[redacted-jwt]")
    .replace(/sb_[a-z]+_[A-Za-z0-9_-]+/g, "[redacted-key]")
    .replace(/postgres(?:ql)?:\/\/[^\s)'"]+/gi, "[redacted-db-url]");
}

function assertStagingOnly(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const service = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const projectId = env.SUPABASE_PROJECT_ID?.trim();

  if (!url || !anon || !service || !projectId) {
    throw new Error("Missing staging keys in .env.staging.local");
  }
  if (projectRefFromUrl(url) !== projectId) {
    throw new Error("Staging URL ref does not match SUPABASE_PROJECT_ID");
  }
  const local = loadEnvFile(localEnvPath);
  if (local.NEXT_PUBLIC_SUPABASE_URL?.trim() === url) {
    throw new Error("Staging URL equals .env.local — refusing");
  }
  if (url.includes("lookcruise")) {
    throw new Error("Refusing URL that looks like production");
  }
  return { url, anon, service, projectId };
}

function promptPasswordHidden() {
  const r = spawnSync(
    "osascript",
    [
      "-e",
      `set theValue to text returned of (display dialog "Enter shared LOOK Staging test password for customer@test.look / provider@test.look (hidden)." with title "LOOK Staging seed verify" default answer "" with hidden answer buttons {"Cancel", "OK"} default button "OK" cancel button "Cancel")
return theValue`,
    ],
    { encoding: "utf8" }
  );
  if (r.status !== 0) throw new Error("Password prompt cancelled");
  return r.stdout.trim();
}

async function findUserIdByEmail(admin, email) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const user = (data?.users ?? []).find(
    (u) => (u.email || "").toLowerCase() === email.toLowerCase()
  );
  if (!user) throw new Error(`Missing auth user: ${email}`);
  return user.id;
}

async function signIn(url, anon, email, password) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.access_token || !body.user?.id) {
    const msg = body.msg || body.error_description || body.error || res.status;
    throw new Error(`sign-in failed for ${email}: ${msg}`);
  }
  return { token: body.access_token, userId: body.user.id };
}

async function resolvePassword(url, anon) {
  const candidates = [
    process.env.LOOK_STAGING_TEST_PASSWORD?.trim(),
    "Test1234!",
  ].filter(Boolean);

  for (const password of candidates) {
    try {
      await signIn(url, anon, CUSTOMER_EMAIL, password);
      return password;
    } catch {
      /* try next */
    }
  }
  return promptPasswordHidden();
}

function line(name, status, result) {
  console.log(`${name} | status: ${status} | ${result}`);
}

async function main() {
  if (!existsSync(stagingEnvPath)) {
    throw new Error("Missing .env.staging.local");
  }
  const { url, anon, service } = assertStagingOnly(loadEnvFile(stagingEnvPath));

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const customerId = await findUserIdByEmail(admin, CUSTOMER_EMAIL);
  const providerId = await findUserIdByEmail(admin, PROVIDER_EMAIL);

  const { data: category, error: catError } = await admin
    .from("categories")
    .select("id, name, slug")
    .eq("slug", CATEGORY_SLUG)
    .maybeSingle();
  if (catError) throw new Error(`categories: ${catError.message}`);
  if (!category?.id) {
    throw new Error(`Category not found: ${CATEGORY_NAME} (${CATEGORY_SLUG})`);
  }

  let requestAction = "reused";
  let { data: request, error: reqLookupError } = await admin
    .from("requests")
    .select(
      "id, title, status, order_payment_status, customer_id, category_id, archived_at, trashed_at"
    )
    .eq("customer_id", customerId)
    .eq("title", REQUEST_TITLE)
    .maybeSingle();
  if (reqLookupError) throw new Error(`request lookup: ${reqLookupError.message}`);

  if (!request) {
    const { data: created, error: createReqError } = await admin
      .from("requests")
      .insert({
        customer_id: customerId,
        category_id: category.id,
        title: REQUEST_TITLE,
        description: REQUEST_DESCRIPTION,
        budget_min: 100,
        budget_max: 500,
        currency: "USD",
        location: "Staging City",
        status: "open",
        order_payment_status: "unpaid",
      })
      .select(
        "id, title, status, order_payment_status, customer_id, category_id, archived_at, trashed_at"
      )
      .single();
    if (createReqError || !created) {
      throw new Error(`request create: ${createReqError?.message || "unknown"}`);
    }
    request = created;
    requestAction = "created";
  } else {
    // Reset to unpaid seed shape; clear prior test payment rows so re-runs stay clean.
    await admin.from("transactions").delete().eq("request_id", request.id);
    await admin.from("platform_commissions").delete().eq("request_id", request.id);
    await admin.from("payments").delete().eq("request_id", request.id);

    const { data: updated, error: updError } = await admin
      .from("requests")
      .update({
        category_id: category.id,
        description: REQUEST_DESCRIPTION,
        status: "open",
        order_payment_status: "unpaid",
        archived_at: null,
        trashed_at: null,
        payment_provider_name: null,
        payment_transaction_id: null,
        stripe_checkout_session_id: null,
        stripe_payment_intent_id: null,
        order_amount: null,
        look_commission: null,
        provider_payout_amount: null,
        paid_at: null,
      })
      .eq("id", request.id)
      .select(
        "id, title, status, order_payment_status, customer_id, category_id, archived_at, trashed_at"
      )
      .single();
    if (updError || !updated) {
      throw new Error(`request update: ${updError?.message || "unknown"}`);
    }
    request = updated;
  }

  let offerAction = "reused";
  let { data: offer, error: offerLookupError } = await admin
    .from("offers")
    .select("id, message, status, request_id, provider_id, price")
    .eq("request_id", request.id)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (offerLookupError) throw new Error(`offer lookup: ${offerLookupError.message}`);

  if (!offer) {
    const { data: createdOffer, error: createOfferError } = await admin
      .from("offers")
      .insert({
        request_id: request.id,
        provider_id: providerId,
        price: 250,
        currency: "USD",
        message: OFFER_MESSAGE,
        estimated_days: 5,
        status: "pending",
      })
      .select("id, message, status, request_id, provider_id, price")
      .single();
    if (createOfferError || !createdOffer) {
      throw new Error(`offer create: ${createOfferError?.message || "unknown"}`);
    }
    offer = createdOffer;
    offerAction = "created";
  } else if (offer.status !== "pending" || offer.message !== OFFER_MESSAGE) {
    const { data: updatedOffer, error: updOfferError } = await admin
      .from("offers")
      .update({
        message: OFFER_MESSAGE,
        status: "pending",
        price: 250,
        estimated_days: 5,
      })
      .eq("id", offer.id)
      .select("id, message, status, request_id, provider_id, price")
      .single();
    if (updOfferError || !updatedOffer) {
      throw new Error(`offer update: ${updOfferError?.message || "unknown"}`);
    }
    offer = updatedOffer;
    offerAction = "updated";
  }

  const password = await resolvePassword(url, anon);
  const customerAuth = await signIn(url, anon, CUSTOMER_EMAIL, password);
  const providerAuth = await signIn(url, anon, PROVIDER_EMAIL, password);

  const customer = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${customerAuth.token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const provider = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${providerAuth.token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const customerRequest = await customer
    .from("requests")
    .select("id, title, status, order_payment_status")
    .eq("id", request.id)
    .maybeSingle();

  const customerOffer = await customer
    .from("offers")
    .select("id, message, status")
    .eq("id", offer.id)
    .maybeSingle();

  const providerOffer = await provider
    .from("offers")
    .select("id, message, status")
    .eq("id", offer.id)
    .maybeSingle();

  const requestOk =
    !customerRequest.error &&
    customerRequest.data?.id === request.id &&
    customerRequest.data?.status === "open" &&
    request.order_payment_status === "unpaid" &&
    request.category_id === category.id;

  const offerCustomerOk =
    !customerOffer.error &&
    customerOffer.data?.id === offer.id &&
    customerOffer.data?.status === "pending";

  const offerProviderOk =
    !providerOffer.error &&
    providerOffer.data?.id === offer.id &&
    providerOffer.data?.status === "pending";

  line(
    `request (${requestAction}): ${request.title}`,
    `${request.status}/${request.order_payment_status}`,
    requestOk ? "PASS" : "FAIL"
  );
  line(
    `offer (${offerAction}): ${offer.message}`,
    offer.status,
    offerCustomerOk && offerProviderOk ? "PASS" : "FAIL"
  );
  line(
    `visibility: customer sees request`,
    request.status,
    !customerRequest.error && customerRequest.data?.id ? "PASS" : "FAIL"
  );
  line(
    `visibility: customer sees offer`,
    offer.status,
    offerCustomerOk ? "PASS" : "FAIL"
  );
  line(
    `visibility: provider sees offer`,
    offer.status,
    offerProviderOk ? "PASS" : "FAIL"
  );
  line(`category: ${category.name}`, CATEGORY_SLUG, category.name === CATEGORY_NAME ? "PASS" : "FAIL");

  const allPass =
    requestOk && offerCustomerOk && offerProviderOk && category.name === CATEGORY_NAME;
  console.log(allPass ? "OVERALL: PASS" : "OVERALL: FAIL");
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("FAIL:", redact(err?.message || err));
  process.exit(1);
});
