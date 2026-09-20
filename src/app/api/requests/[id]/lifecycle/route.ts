import { getWorkLifecycleState } from "@/lib/data/work-lifecycle-state";
import { getOrderDisputeForRequest } from "@/lib/data/order-disputes";
import { isStripeConfigured } from "@/lib/payments/stripe";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: request }, lifecycle, dispute] = await Promise.all([
    supabase
      .from("requests")
      .select(
        "id, customer_id, status, currency, order_payment_status, refund_dispute_status, refund_reason, cancellation_reason, is_test"
      )
      .eq("id", requestId)
      .maybeSingle(),
    getWorkLifecycleState(supabase, requestId),
    getOrderDisputeForRequest(supabase, requestId),
  ]);

  let requestRow = request;
  if (!requestRow) {
    const fallback = await supabase
      .from("requests")
      .select(
        "id, customer_id, status, currency, order_payment_status, refund_dispute_status, refund_reason, cancellation_reason"
      )
      .eq("id", requestId)
      .maybeSingle();
    requestRow = fallback.data as typeof request;
  }

  if (!requestRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: acceptedOffer } = await supabase
    .from("offers")
    .select("provider_id, price, currency")
    .eq("request_id", requestId)
    .eq("status", "accepted")
    .maybeSingle();

  const isParty =
    user.id === requestRow.customer_id || user.id === acceptedOffer?.provider_id;

  if (!isParty) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    requestId,
    customerId: requestRow.customer_id,
    dbStatus: requestRow.status,
    effectiveStatus: lifecycle?.effectiveStatus ?? requestRow.status,
    revisionFeedback: lifecycle?.revisionFeedback ?? null,
    acceptedProviderId: acceptedOffer?.provider_id ?? null,
    grossAmount: Number(acceptedOffer?.price ?? 0),
    currency: acceptedOffer?.currency ?? requestRow.currency,
    orderPaymentStatus: requestRow.order_payment_status ?? "unpaid",
    refundDisputeStatus: requestRow.refund_dispute_status ?? "none",
    isTest: Boolean((requestRow as { is_test?: boolean }).is_test),
    liveCheckoutAvailable: isStripeConfigured(),
    dispute,
    disputeFallbackReason:
      requestRow.refund_reason ?? requestRow.cancellation_reason ?? null,
  });
}
