/**
 * Pure routing helpers for the Stripe webhook.
 *
 * Authoritative success event for Checkout (mode=payment):
 *   checkout.session.completed (when payment_status is paid / status complete)
 *
 * payment_intent.succeeded is a supplementary backup only. Both paths call the
 * same idempotent confirm_stripe_payment RPC and share external_reference /
 * stripe_payment_intent_id uniqueness — they must never create two payments.
 */

export type StripeWebhookSuccessKind =
  | "checkout_session_completed"
  | "payment_intent_succeeded_supplementary"
  | "payment_intent_failed"
  | "checkout_session_expired"
  | "ignored";

export type StripeWebhookClaimResult =
  | "claimed"
  | "retried"
  | "already_processed"
  | "already_processing"
  | "unavailable";

export type StripeWebhookClaimDecision =
  | { action: "process"; claim: "claimed" | "retried" }
  | { action: "ack"; claim: "already_processed" | "already_processing"; reason: string }
  | { action: "retry_later"; claim: "unavailable"; reason: string };

/** Pure mapping from claim RPC outcome → HTTP/handler decision. */
export function decideStripeWebhookClaim(
  claim: StripeWebhookClaimResult
): StripeWebhookClaimDecision {
  if (claim === "claimed" || claim === "retried") {
    return { action: "process", claim };
  }
  if (claim === "already_processed") {
    return {
      action: "ack",
      claim,
      reason: "Event already processed",
    };
  }
  if (claim === "already_processing") {
    return {
      action: "ack",
      claim,
      reason: "Event already being processed",
    };
  }
  return {
    action: "retry_later",
    claim: "unavailable",
    reason: "Webhook event store unavailable",
  };
}

export function classifyStripeWebhookEvent(eventType: string): StripeWebhookSuccessKind {
  switch (eventType) {
    case "checkout.session.completed":
      return "checkout_session_completed";
    case "payment_intent.succeeded":
      // Supplementary backup — same confirm RPC; DB enforces single payment.
      return "payment_intent_succeeded_supplementary";
    case "payment_intent.payment_failed":
      return "payment_intent_failed";
    case "checkout.session.expired":
      return "checkout_session_expired";
    default:
      return "ignored";
  }
}

export function shouldConfirmCheckoutSession(session: {
  payment_status?: string | null;
  status?: string | null;
}): boolean {
  return session.payment_status === "paid" || session.status === "complete";
}

/** HTTP outcome after claim + process. */
export type WebhookHttpDecision =
  | { status: 200; body: Record<string, unknown> }
  | { status: 400 | 500 | 503; body: Record<string, unknown> };

export function ackDuplicateEvent(reason: string): WebhookHttpDecision {
  return { status: 200, body: { received: true, duplicate: true, reason } };
}

export function ackIgnoredEvent(eventType: string): WebhookHttpDecision {
  return { status: 200, body: { received: true, ignored: true, event_type: eventType } };
}

export function ackProcessedEvent(eventId: string): WebhookHttpDecision {
  return { status: 200, body: { received: true, event_id: eventId } };
}

export function safeWebhookErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return "Webhook processing failed";
}
