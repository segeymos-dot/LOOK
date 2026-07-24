import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppOrigin } from "@/lib/app-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { beginTestOrderPayment } from "@/lib/payments/order-payment";
import {
  fromStripeAmount,
  getStripe,
  stripeProviderName,
  toStripeAmount,
} from "@/lib/payments/stripe";
import {
  assertStripeSessionMatchesOrder,
  resolveStripeRequestId,
  verifyStripeAmountAndCurrency,
} from "@/lib/payments/stripe-payment-verify";
import type { PaymentSimulationResult } from "@/types";
import type Stripe from "stripe";

export type StripeCheckoutResult = {
  url: string;
  sessionId: string;
  paymentIntentId: string | null;
  reused?: boolean;
};

type OrderCheckoutContext = {
  requestId: string;
  customerId: string;
  providerId?: string | null;
  customerEmail?: string | null;
  title: string;
  amount: number;
  currency: string;
  /** Existing open Checkout Session id, if any. */
  existingCheckoutSessionId?: string | null;
  /** Monotonic attempt counter used in Stripe idempotency keys. */
  checkoutAttempt?: number | null;
};

async function persistCheckoutSessionIds(input: {
  requestId: string;
  sessionId: string;
  paymentIntentId: string | null;
  checkoutAttempt: number;
}) {
  const admin = createAdminClient();
  if (!admin) return;

  await admin
    .from("requests")
    .update({
      payment_provider_name: stripeProviderName(),
      payment_transaction_id: input.paymentIntentId ?? input.sessionId,
      stripe_checkout_session_id: input.sessionId,
      stripe_payment_intent_id: input.paymentIntentId,
      stripe_checkout_attempt: input.checkoutAttempt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.requestId);
}

/**
 * Create (or reuse) a Stripe Checkout Session for an order.
 * Idempotency key is deterministic per order amount/currency/attempt — never reused
 * for materially different payment data.
 */
export async function createOrderCheckoutSession(
  supabase: SupabaseClient,
  ctx: OrderCheckoutContext,
  originHint?: string
): Promise<{ success: true; data: StripeCheckoutResult } | { success: false; error: string }> {
  const begun = await beginTestOrderPayment(supabase, ctx.requestId);
  if (!begun.success) {
    return begun;
  }

  const stripe = getStripe();
  const origin = getAppOrigin(originHint);
  const currency = ctx.currency.trim().toLowerCase();
  const unitAmount = toStripeAmount(ctx.amount, currency);

  if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
    return { success: false, error: "Invalid payment amount" };
  }

  let attempt = Math.max(1, Number(ctx.checkoutAttempt ?? 0) || 1);

  // Reuse an open Checkout Session to prevent duplicate pending payments.
  if (ctx.existingCheckoutSessionId) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(ctx.existingCheckoutSessionId);
      if (existing.status === "open" && existing.url) {
        const existingMinor = existing.amount_total;
        const existingCurrency = (existing.currency ?? "").toLowerCase();
        const sameMoney =
          existingMinor === unitAmount && existingCurrency === currency;
        const sameOrder =
          resolveStripeRequestId({
            metadataRequestId: existing.metadata?.request_id,
            clientReferenceId: existing.client_reference_id,
          }) === ctx.requestId;

        if (sameMoney && sameOrder) {
          const paymentIntentId =
            typeof existing.payment_intent === "string"
              ? existing.payment_intent
              : existing.payment_intent?.id ?? null;

          await persistCheckoutSessionIds({
            requestId: ctx.requestId,
            sessionId: existing.id,
            paymentIntentId,
            checkoutAttempt: attempt,
          });

          return {
            success: true,
            data: {
              url: existing.url,
              sessionId: existing.id,
              paymentIntentId,
              reused: true,
            },
          };
        }
      }

      // Expired / completed / amount changed → new attempt (new idempotency key).
      if (existing.status !== "open") {
        attempt = Math.max(attempt + 1, (ctx.checkoutAttempt ?? 0) + 1);
      } else {
        attempt = Math.max(attempt + 1, (ctx.checkoutAttempt ?? 0) + 1);
      }
    } catch {
      attempt = Math.max(attempt + 1, (ctx.checkoutAttempt ?? 0) + 1);
    }
  }

  const metadata: Record<string, string> = {
    request_id: ctx.requestId,
    customer_id: ctx.customerId,
    payment_provider: stripeProviderName(),
  };
  if (ctx.providerId) {
    metadata.provider_id = ctx.providerId;
  }

  // Deterministic per order + amount + currency + attempt. Do not reuse across
  // different amounts/currencies (unitAmount/currency are part of the key).
  const idempotencyKey = `look_checkout_${ctx.requestId}_${unitAmount}_${currency}_a${attempt}`;

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: ctx.customerEmail ?? undefined,
        client_reference_id: ctx.requestId,
        success_url: `${origin}/requests/${ctx.requestId}/payment?success=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/requests/${ctx.requestId}/payment?canceled=1`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: unitAmount,
              product_data: {
                name: `LOOK order: ${ctx.title}`.slice(0, 120),
                metadata: {
                  request_id: ctx.requestId,
                },
              },
            },
          },
        ],
        payment_intent_data: {
          metadata,
        },
        metadata,
      },
      { idempotencyKey }
    );

    if (!session.url) {
      return { success: false, error: "Stripe Checkout URL was not returned" };
    }

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    await persistCheckoutSessionIds({
      requestId: ctx.requestId,
      sessionId: session.id,
      paymentIntentId,
      checkoutAttempt: attempt,
    });

    return {
      success: true,
      data: {
        url: session.url,
        sessionId: session.id,
        paymentIntentId,
        reused: false,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to create Stripe Checkout Session",
    };
  }
}

/**
 * Backup sync after Checkout redirect. Always retrieves the Session from Stripe
 * and verifies metadata + amount before writing. Query params alone never mark paid.
 */
export async function confirmStripeCheckoutSession(
  sessionId: string,
  expectedRequestId: string
): Promise<{ success: true; data: PaymentSimulationResult } | { success: false; error: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });

  const sessionRequestId = resolveStripeRequestId({
    metadataRequestId: session.metadata?.request_id,
    clientReferenceId: session.client_reference_id,
  });
  const match = assertStripeSessionMatchesOrder(sessionRequestId, expectedRequestId);
  if (!match.ok) {
    return { success: false, error: match.error };
  }

  return confirmFromCheckoutSession(session);
}

export async function confirmFromCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<{ success: true; data: PaymentSimulationResult } | { success: false; error: string }> {
  if (session.payment_status !== "paid" && session.status !== "complete") {
    return { success: false, error: "Checkout session is not paid yet" };
  }

  const requestId = resolveStripeRequestId({
    metadataRequestId: session.metadata?.request_id,
    clientReferenceId: session.client_reference_id,
  });
  if (!requestId) {
    return { success: false, error: "Missing request_id on Checkout Session" };
  }

  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const amountCheck = await verifySessionAgainstOrder({
    requestId,
    stripeAmountMinor: session.amount_total,
    stripeCurrency: session.currency,
  });
  if (!amountCheck.ok) {
    return { success: false, error: amountCheck.error };
  }

  return confirmStripePaymentInDb({
    requestId,
    externalReference: paymentIntent ?? session.id,
    checkoutSessionId: session.id,
    paymentIntentId: paymentIntent,
    amountReceived: amountCheck.amountMajor,
    currency: amountCheck.currency,
  });
}

export async function confirmFromPaymentIntent(
  paymentIntent: Stripe.PaymentIntent
): Promise<{ success: true; data: PaymentSimulationResult } | { success: false; error: string }> {
  if (paymentIntent.status !== "succeeded") {
    return { success: false, error: "PaymentIntent has not succeeded" };
  }

  const requestId = paymentIntent.metadata?.request_id?.trim();
  if (!requestId) {
    return { success: false, error: "Missing request_id on PaymentIntent" };
  }

  const amountCheck = await verifySessionAgainstOrder({
    requestId,
    stripeAmountMinor: paymentIntent.amount_received || paymentIntent.amount,
    stripeCurrency: paymentIntent.currency,
  });
  if (!amountCheck.ok) {
    return { success: false, error: amountCheck.error };
  }

  return confirmStripePaymentInDb({
    requestId,
    externalReference: paymentIntent.id,
    checkoutSessionId: null,
    paymentIntentId: paymentIntent.id,
    amountReceived: amountCheck.amountMajor,
    currency: amountCheck.currency,
  });
}

async function verifySessionAgainstOrder(input: {
  requestId: string;
  stripeAmountMinor: number | null | undefined;
  stripeCurrency: string | null | undefined;
}): Promise<
  | { ok: true; amountMajor: number; currency: string }
  | { ok: false; error: string }
> {
  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      error: "SUPABASE_SERVICE_ROLE_KEY is required to confirm Stripe payments",
    };
  }

  const { data: order, error } = await admin
    .from("requests")
    .select("id, order_amount, currency, order_payment_status, customer_id, status")
    .eq("id", input.requestId)
    .maybeSingle();

  if (error || !order) {
    return { ok: false, error: "Request not found" };
  }

  if (order.order_payment_status === "paid" || order.order_payment_status === "completed") {
    // Still verify money for defense in depth; confirm RPC will short-circuit as already_paid.
  } else if (order.status !== "in_progress") {
    return { ok: false, error: "Payment is only available for orders in progress" };
  }

  let expectedAmount = Number(order.order_amount);
  let expectedCurrency = String(order.currency ?? "");

  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0 || !expectedCurrency) {
    const { data: offer } = await admin
      .from("offers")
      .select("price, currency")
      .eq("request_id", input.requestId)
      .eq("status", "accepted")
      .maybeSingle();

    if (!offer) {
      return { ok: false, error: "No accepted offer found for this order" };
    }
    expectedAmount = Number(offer.price);
    expectedCurrency = String(offer.currency ?? "USD");
  }

  const checked = verifyStripeAmountAndCurrency({
    stripeAmountMinor: input.stripeAmountMinor,
    stripeCurrency: input.stripeCurrency,
    expectedAmountMajor: expectedAmount,
    expectedCurrency,
  });

  if (!checked.ok) {
    return checked;
  }

  return {
    ok: true,
    amountMajor: checked.amountMajor,
    currency: checked.currency,
  };
}

async function confirmStripePaymentInDb(input: {
  requestId: string;
  externalReference: string;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  amountReceived: number;
  currency: string;
}): Promise<{ success: true; data: PaymentSimulationResult } | { success: false; error: string }> {
  const admin = createAdminClient();
  if (!admin) {
    return {
      success: false,
      error: "SUPABASE_SERVICE_ROLE_KEY is required to confirm Stripe payments",
    };
  }

  const { data, error } = await admin.rpc("confirm_stripe_payment", {
    p_request_id: input.requestId,
    p_external_reference: input.externalReference,
    p_checkout_session_id: input.checkoutSessionId,
    p_payment_intent_id: input.paymentIntentId,
    p_amount_received: input.amountReceived,
    p_currency: input.currency.toUpperCase(),
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      ...(data as PaymentSimulationResult),
      payment_provider: stripeProviderName(),
    },
  };
}

export async function markStripePaymentFailed(requestId: string, reference?: string | null) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.rpc("mark_order_payment_failed", {
    p_request_id: requestId,
    p_external_reference: reference ?? null,
  });
}

/** Exported for tests — major-unit conversion used when logging only. */
export function stripeAmountMajorForLog(
  minor: number | null | undefined,
  currency: string | null | undefined
): number | null {
  if (minor == null || !currency) return null;
  return fromStripeAmount(minor, currency);
}
