import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  getStripe,
  getStripeWebhookSecret,
  isStripeConfigured,
  missingStripeEnvVars,
} from "@/lib/payments/stripe";
import {
  confirmFromCheckoutSession,
  confirmFromPaymentIntent,
  markStripePaymentFailed,
} from "@/lib/payments/stripe-order-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook — confirms order payment in Supabase after successful Checkout / PaymentIntent.
 * Configure endpoint: POST /api/webhooks/stripe
 * Events: checkout.session.completed, payment_intent.succeeded, payment_intent.payment_failed
 */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { success: false, error: "Stripe is not configured", missing_env: missingStripeEnvVars() },
      { status: 503 }
    );
  }

  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    return NextResponse.json(
      {
        success: false,
        error: "STRIPE_WEBHOOK_SECRET is missing",
        missing_env: ["STRIPE_WEBHOOK_SECRET"],
      },
      { status: 503 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ success: false, error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : "Invalid Stripe signature",
      },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status === "paid" || session.status === "complete") {
          const result = await confirmFromCheckoutSession(session);
          if (!result.success) {
            console.error("[stripe webhook] confirm checkout failed:", result.error);
            return NextResponse.json({ success: false, error: result.error }, { status: 500 });
          }
        }
        break;
      }
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const result = await confirmFromPaymentIntent(paymentIntent);
        if (!result.success) {
          // Checkout handler may already have confirmed; ignore duplicate / metadata gaps from PI-only path.
          if (
            result.error.includes("Missing request_id") ||
            result.error.toLowerCase().includes("already")
          ) {
            break;
          }
          console.error("[stripe webhook] confirm PI failed:", result.error);
          return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const requestId = paymentIntent.metadata?.request_id;
        if (requestId) {
          await markStripePaymentFailed(requestId, paymentIntent.id);
        }
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const requestId = session.metadata?.request_id ?? session.client_reference_id;
        if (requestId) {
          await markStripePaymentFailed(requestId, session.id);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[stripe webhook] handler error:", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Webhook handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
