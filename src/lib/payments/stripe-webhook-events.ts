/**
 * Database-backed Stripe webhook event claiming (service_role only).
 * Ensures each Stripe event id is processed at most once.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { StripeWebhookClaimResult } from "@/lib/payments/stripe-webhook-routing";

export type { StripeWebhookClaimResult };

export async function claimStripeWebhookEvent(input: {
  stripeEventId: string;
  eventType: string;
  objectId?: string | null;
}): Promise<StripeWebhookClaimResult> {
  const admin = createAdminClient();
  if (!admin) return "unavailable";

  const { data, error } = await admin.rpc("claim_stripe_webhook_event", {
    p_stripe_event_id: input.stripeEventId,
    p_event_type: input.eventType,
    p_object_id: input.objectId ?? null,
  });

  if (error) {
    console.error("[stripe webhook] claim failed:", error.message);
    return "unavailable";
  }

  const value = String(data ?? "");
  if (
    value === "claimed" ||
    value === "retried" ||
    value === "already_processed" ||
    value === "already_processing"
  ) {
    return value;
  }

  console.error("[stripe webhook] unexpected claim result:", value);
  return "unavailable";
}

export async function completeStripeWebhookEvent(stripeEventId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin.rpc("complete_stripe_webhook_event", {
    p_stripe_event_id: stripeEventId,
  });
  if (error) {
    console.error("[stripe webhook] complete failed:", error.message);
  }
}

export async function failStripeWebhookEvent(
  stripeEventId: string,
  errorSummary: string
): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin.rpc("fail_stripe_webhook_event", {
    p_stripe_event_id: stripeEventId,
    p_error: errorSummary.slice(0, 500),
  });
  if (error) {
    console.error("[stripe webhook] fail mark failed:", error.message);
  }
}

/** Extract a safe object id for logging / event rows (no secrets). */
export function stripeEventObjectId(
  _eventType: string,
  object: { id?: string } | null
): string | null {
  if (!object?.id) return null;
  return object.id;
}
