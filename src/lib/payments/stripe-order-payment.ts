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
import type { PaymentSimulationResult } from "@/types";
import type Stripe from "stripe";

export type StripeCheckoutResult = {
  url: string;
  sessionId: string;
  paymentIntentId: string | null;
};

type OrderCheckoutContext = {
  requestId: string;
  customerId: string;
  customerEmail?: string | null;
  title: string;
  amount: number;
  currency: string;
};

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

  try {
    const session = await stripe.checkout.sessions.create({
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
        metadata: {
          request_id: ctx.requestId,
          customer_id: ctx.customerId,
          payment_provider: stripeProviderName(),
        },
      },
      metadata: {
        request_id: ctx.requestId,
        customer_id: ctx.customerId,
        payment_provider: stripeProviderName(),
      },
    });

    if (!session.url) {
      return { success: false, error: "Stripe Checkout URL was not returned" };
    }

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    const admin = createAdminClient();
    if (admin) {
      // Soft-fail: columns exist only after migration 022+.
      await admin
        .from("requests")
        .update({
          payment_provider_name: stripeProviderName(),
          payment_transaction_id: paymentIntentId ?? session.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ctx.requestId);
    }

    return {
      success: true,
      data: {
        url: session.url,
        sessionId: session.id,
        paymentIntentId,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to create Stripe Checkout Session",
    };
  }
}

export async function confirmStripeCheckoutSession(
  sessionId: string
): Promise<{ success: true; data: PaymentSimulationResult } | { success: false; error: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });
  return confirmFromCheckoutSession(session);
}

export async function confirmFromCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<{ success: true; data: PaymentSimulationResult } | { success: false; error: string }> {
  if (session.payment_status !== "paid" && session.status !== "complete") {
    return { success: false, error: "Checkout session is not paid yet" };
  }

  const requestId = session.metadata?.request_id ?? session.client_reference_id;
  if (!requestId) {
    return { success: false, error: "Missing request_id on Checkout Session" };
  }

  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const amountTotal = session.amount_total;
  const currency = session.currency ?? "usd";
  const amountReceived =
    amountTotal != null ? fromStripeAmount(amountTotal, currency) : null;

  return confirmStripePaymentInDb({
    requestId,
    externalReference: paymentIntent ?? session.id,
    checkoutSessionId: session.id,
    paymentIntentId: paymentIntent,
    amountReceived,
    currency,
  });
}

export async function confirmFromPaymentIntent(
  paymentIntent: Stripe.PaymentIntent
): Promise<{ success: true; data: PaymentSimulationResult } | { success: false; error: string }> {
  if (paymentIntent.status !== "succeeded") {
    return { success: false, error: "PaymentIntent has not succeeded" };
  }

  const requestId = paymentIntent.metadata?.request_id;
  if (!requestId) {
    return { success: false, error: "Missing request_id on PaymentIntent" };
  }

  return confirmStripePaymentInDb({
    requestId,
    externalReference: paymentIntent.id,
    checkoutSessionId: null,
    paymentIntentId: paymentIntent.id,
    amountReceived: fromStripeAmount(paymentIntent.amount_received || paymentIntent.amount, paymentIntent.currency),
    currency: paymentIntent.currency,
  });
}

async function confirmStripePaymentInDb(input: {
  requestId: string;
  externalReference: string;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  amountReceived: number | null;
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
