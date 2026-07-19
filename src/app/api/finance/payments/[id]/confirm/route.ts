import { isDemoMode } from "@/lib/config";
import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { isStripeConfigured, missingStripeEnvVars } from "@/lib/payments/stripe";
import { confirmStripeCheckoutSession } from "@/lib/payments/stripe-order-payment";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/**
 * Sync confirmation after Stripe Checkout redirect (backup when webhook is delayed/local).
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
    const body = (await request.json()) as { session_id?: string };
    sessionId = body.session_id?.trim();
  } catch {
    // ignore
  }

  if (!sessionId) {
    return NextResponse.json({ success: false, error: "session_id is required" }, { status: 400 });
  }

  const { data: order } = await auth.supabase
    .from("requests")
    .select("id, customer_id")
    .eq("id", requestId)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
  }
  if (order.customer_id !== auth.user.id) {
    return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
  }

  const result = await confirmStripeCheckoutSession(sessionId);
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
