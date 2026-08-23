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
import {
  claimStripeWebhookEvent,
  completeStripeWebhookEvent,
  failStripeWebhookEvent,
  stripeEventObjectId,
} from "@/lib/payments/stripe-webhook-events";
import {
  ackDuplicateEvent,
  ackIgnoredEvent,
  ackProcessedEvent,
  classifyStripeWebhookEvent,
  decideStripeWebhookClaim,
  safeWebhookErrorMessage,
  shouldConfirmCheckoutSession,
} from "@/lib/payments/stripe-webhook-routing";
import { resolveStripeRequestId } from "@/lib/payments/stripe-payment-verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook — authoritative payment confirmation for LOOK orders.
 * Endpoint: POST /api/webhooks/stripe
 *
 * Signature: raw body + stripe-signature + STRIPE_WEBHOOK_SECRET via constructEvent.
 * Idempotency: stripe_webhook_events claim (service_role) before any state change.
 *
 * Authoritative success event (Checkout mode=payment):
 *   checkout.session.completed
 * Supplementary backup (same confirm RPC, never a second payment):
 *   payment_intent.succeeded
 * Failure / expiry:
 *   payment_intent.payment_failed, checkout.session.expired
 * Unknown events: HTTP 200, no payment state change.
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

  // Read the raw body exactly once — never JSON.parse/reserialize before verify.
  const rawBody = await request.text();
  if (!rawBody) {
    return NextResponse.json({ success: false, error: "Empty webhook body" }, { status: 400 });
  }

  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    // Do not echo verification internals or secrets.
    return NextResponse.json({ success: false, error: "Invalid Stripe signature" }, { status: 400 });
  }

  const objectId = stripeEventObjectId(
    event.type,
    event.data.object as { id?: string }
  );

  const claimRaw = await claimStripeWebhookEvent({
    stripeEventId: event.id,
    eventType: event.type,
    objectId,
  });
  const decision = decideStripeWebhookClaim(claimRaw);

  if (decision.action === "ack") {
    return NextResponse.json(ackDuplicateEvent(decision.reason).body);
  }

  if (decision.action === "retry_later") {
    // Ask Stripe to retry when the event store is unavailable.
    return NextResponse.json(
      { success: false, error: decision.reason },
      { status: 503 }
    );
  }

  const kind = classifyStripeWebhookEvent(event.type);

  try {
    switch (kind) {
      case "checkout_session_completed": {
        // Authoritative success path for Checkout Sessions.
        const session = event.data.object as Stripe.Checkout.Session;
        if (shouldConfirmCheckoutSession(session)) {
          const result = await confirmFromCheckoutSession(session);
          if (!result.success) {
            await failStripeWebhookEvent(event.id, result.error);
            console.error("[stripe webhook] confirm checkout failed:", {
              event_id: event.id,
              session_id: session.id,
              error: result.error,
            });
            return NextResponse.json({ success: false, error: result.error }, { status: 500 });
          }
        }
        break;
      }
      case "payment_intent_succeeded_supplementary": {
        // Supplementary only — same confirm RPC / unique Stripe ids prevent double pay.
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const result = await confirmFromPaymentIntent(paymentIntent);
        if (!result.success) {
          const soft =
            result.error.includes("Missing request_id") ||
            result.error.toLowerCase().includes("already");
          if (soft) {
            break;
          }
          await failStripeWebhookEvent(event.id, result.error);
          console.error("[stripe webhook] confirm PI failed:", {
            event_id: event.id,
            payment_intent_id: paymentIntent.id,
            error: result.error,
          });
          return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }
        break;
      }
      case "payment_intent_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const requestId = paymentIntent.metadata?.request_id;
        if (requestId) {
          await markStripePaymentFailed(requestId, paymentIntent.id);
        }
        break;
      }
      case "checkout_session_expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const requestId = resolveStripeRequestId({
          metadataRequestId: session.metadata?.request_id,
          clientReferenceId: session.client_reference_id,
        });
        if (requestId) {
          await markStripePaymentFailed(requestId, session.id);
        }
        break;
      }
      case "ignored":
      default: {
        await completeStripeWebhookEvent(event.id);
        return NextResponse.json(ackIgnoredEvent(event.type).body);
      }
    }

    await completeStripeWebhookEvent(event.id);
    return NextResponse.json(ackProcessedEvent(event.id).body);
  } catch (e) {
    const message = safeWebhookErrorMessage(e);
    await failStripeWebhookEvent(event.id, message);
    console.error("[stripe webhook] handler error:", {
      event_id: event.id,
      event_type: event.type,
      error: message,
    });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
