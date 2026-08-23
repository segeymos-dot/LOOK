import { getOrderDisputeForRequest } from "@/lib/data/order-disputes";
import { isPlatformAdmin } from "@/lib/data/finance-actions";
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

  const [{ data: request }, { data: acceptedOffer }, admin] = await Promise.all([
    supabase
      .from("requests")
      .select(
        "id, customer_id, currency, order_payment_status, refund_dispute_status, refund_reason, cancellation_reason"
      )
      .eq("id", requestId)
      .maybeSingle(),
    supabase
      .from("offers")
      .select("provider_id, currency")
      .eq("request_id", requestId)
      .eq("status", "accepted")
      .maybeSingle(),
    isPlatformAdmin(supabase, user.id),
  ]);

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isParty =
    user.id === request.customer_id || user.id === acceptedOffer?.provider_id;

  if (!isParty && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dispute = await getOrderDisputeForRequest(supabase, requestId);

  return NextResponse.json({
    success: true,
    refundDisputeStatus: request.refund_dispute_status ?? "none",
    orderPaymentStatus: request.order_payment_status ?? "unpaid",
    currency: acceptedOffer?.currency ?? request.currency ?? null,
    dispute,
    disputeFallbackReason: request.refund_reason ?? request.cancellation_reason ?? null,
  });
}
