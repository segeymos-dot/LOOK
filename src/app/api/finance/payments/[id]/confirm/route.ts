import { isDemoMode } from "@/lib/config";
import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { isStripeConfigured, missingStripeEnvVars } from "@/lib/payments/stripe";
import { confirmStripeCheckoutSession } from "@/lib/payments/stripe-order-payment";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/**
 * Backup sync after Stripe Checkout redirect (when webhook is delayed).
 *
 * Does NOT trust query params or a client-invented payment status.
 * Requires an authenticated order owner and retrieves + verifies the Checkout
 * Session from Stripe (metadata, amount, currency, paid status) before any DB write.
 * The webhook remains the authoritative confirmation path.
 *
 * Body: { session_id: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  if (isDemoMode()) {
    return NextResponse.json(
      { success: false, error: "Stripe confirm is unavailable in demo mode" },
      { status: 400 }
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error: "Stripe is not configured",
        missing_env: missingStripeEnvVars(),
      },
      { status: 503 }
    );
  }

  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  let sessionId: string | undefined;
  try {
    const body = (await request.json()) as { session_id?: string; status?: string };
    sessionId = body.session_id?.trim();
    // Ignore any client-supplied status / amount / paid flags.
    void body.status;
  } catch {
    // ignore
  }

  if (!sessionId) {
    return NextResponse.json({ success: false, error: "session_id is required" }, { status: 400 });
  }

  // Reject obviously non-Stripe session ids before calling the API.
  if (!sessionId.startsWith("cs_")) {
    return NextResponse.json({ success: false, error: "Invalid Checkout Session id" }, { status: 400 });
  }

  const { data: order } = await auth.supabase
    .from("requests")
    .select("id, customer_id, order_payment_status")
    .eq("id", requestId)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
  }
  if (order.customer_id !== auth.user.id) {
    return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
  }

  // Already paid — do not invent a second confirmation; refresh UI from server state.
  if (order.order_payment_status === "paid" || order.order_payment_status === "completed") {
    return NextResponse.json({
      success: true,
      request_id: requestId,
      status: "paid",
      order_payment_status: order.order_payment_status,
      already_paid: true,
      payment_provider: "stripe",
    });
  }

  // Verify ownership + amount against Stripe object BEFORE any paid write.
  const result = await confirmStripeCheckoutSession(sessionId, requestId);
  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  if (result.data.request_id && result.data.request_id !== requestId) {
    return NextResponse.json(
      { success: false, error: "Checkout session does not match this order" },
      { status: 400 }
    );
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath(`/requests/${requestId}/payment`);
  revalidatePath("/profile");
  revalidatePath("/my/balance");
  revalidatePath("/admin/platform");
  revalidatePath("/finance/transactions");

  return NextResponse.json({
    success: true,
    ...result.data,
    order_payment_status: result.data.order_payment_status ?? "paid",
  });
}
