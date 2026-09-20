import { getMockRequest } from "@/lib/mock/data";
import { setMockOrderPaymentPending } from "@/lib/mock/order-payments";
import { isDemoMode } from "@/lib/config";
import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { getAppOrigin } from "@/lib/app-url";
import { loadOrderForCheckout } from "@/lib/payments/load-order-for-checkout";
import { isStripeConfigured, missingStripeEnvVars } from "@/lib/payments/stripe";
import { createOrderCheckoutSession } from "@/lib/payments/stripe-order-payment";
import { areTestPaymentsEnabled } from "@/lib/payments/test-payments-guard";
import { NextResponse } from "next/server";

/**
 * Creates a Stripe Checkout Session for a NON-test order.
 * TEST orders (is_test=true) never enter Stripe — hard refuse.
 * Missing Stripe config fails safely with no live fallback to test simulator.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  if (isDemoMode()) {
    const req = getMockRequest(requestId);
    if (!req) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }
    setMockOrderPaymentPending(requestId);
    return NextResponse.json({
      success: false,
      error: "Stripe Checkout is unavailable in demo mode. Use the test checkout form.",
      demo_fallback: true,
    }, { status: 400 });
  }

  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const loaded = await loadOrderForCheckout(auth.supabase, requestId);
  if (!loaded.ok) {
    if (loaded.kind === "schema") {
      return NextResponse.json(
        { success: false, error: "Order payment schema is unavailable" },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
  }
  const order = loaded.order;

  if (order.customer_id !== auth.user.id) {
    return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
  }

  // Hard split: TEST orders never call Stripe (no LIVE↔TEST fallback).
  if ((order as { is_test?: boolean }).is_test) {
    return NextResponse.json(
      {
        success: false,
        error: "TEST orders cannot use Stripe. Use Complete test payment.",
        test_fallback: true,
        is_test: true,
      },
      { status: 400 }
    );
  }

  if (!isStripeConfigured()) {
    const allowTestFallback = areTestPaymentsEnabled();
    return NextResponse.json(
      {
        success: false,
        code: "stripe_not_configured",
        error: allowTestFallback
          ? "Stripe is not configured. Use test payment on this Preview."
          : "Stripe is not configured. Test payments are disabled.",
        missing_env: missingStripeEnvVars(),
        test_fallback: allowTestFallback,
        is_test: false,
      },
      { status: 503 }
    );
  }

  if (order.status !== "in_progress") {
    return NextResponse.json(
      { success: false, error: "Payment is only available for orders in progress" },
      { status: 400 }
    );
  }

  if (order.order_payment_status === "paid" || order.order_payment_status === "completed") {
    return NextResponse.json({ success: false, error: "Order is already paid" }, { status: 400 });
  }

  const { data: offer } = await auth.supabase
    .from("offers")
    .select("price, currency, provider_id")
    .eq("request_id", requestId)
    .eq("status", "accepted")
    .maybeSingle();

  if (!offer) {
    return NextResponse.json({ success: false, error: "No accepted offer" }, { status: 400 });
  }

  // Authoritative amount/currency: accepted offer only (never requests.order_amount).
  const amount = Number(offer.price);
  const currency = String(offer.currency ?? "USD").trim();
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { success: false, error: "Invalid accepted offer price" },
      { status: 400 }
    );
  }
  if (!currency) {
    return NextResponse.json(
      { success: false, error: "Invalid accepted offer currency" },
      { status: 400 }
    );
  }
  const origin = getAppOrigin(request.headers.get("origin") ?? undefined);

  const result = await createOrderCheckoutSession(
    auth.supabase,
    {
      requestId,
      customerId: auth.user.id,
      providerId: offer.provider_id,
      customerEmail: auth.user.email,
      title: order.title ?? "LOOK order",
      amount,
      currency,
      existingCheckoutSessionId: order.stripe_checkout_session_id,
      checkoutAttempt: order.stripe_checkout_attempt,
    },
    origin
  );

  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    checkout_url: result.data.url,
    session_id: result.data.sessionId,
    payment_intent_id: result.data.paymentIntentId,
    order_payment_status: "payment_pending",
  });
}
