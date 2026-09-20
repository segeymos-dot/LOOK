import { getMockOffers, getMockRequest } from "@/lib/mock/data";
import { getDemoPaymentForRequest, simulateDemoPayment } from "@/lib/mock/finance";
import { getMockOrderPayment, initDemoOrderPayment, markMockOrderPaid } from "@/lib/mock/order-payments";
import { isDemoMode } from "@/lib/config";
import {
  getPaymentForRequest,
  isPlatformAdmin,
  simulateTestPayment,
} from "@/lib/data/finance-actions";
import {
  executeProdSafeTestPayment,
  getOrderPaymentSnapshot,
} from "@/lib/payments/order-payment";
import { isMissingColumnError } from "@/lib/payments/load-order-for-checkout";
import { authorizeTestOrderPayment } from "@/lib/payments/test-payment-authorization";
import {
  areTestPaymentsEnabled,
  canInvokeProdSafeTestPayment,
  canInvokeSimulatedOrderPayment,
  prodSafeTestDeniedJson,
  testPaymentsActorDeniedJson,
  testPaymentsDisabledJson,
} from "@/lib/payments/test-payments-guard";
import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  if (isDemoMode()) {
    if (!areTestPaymentsEnabled()) {
      return NextResponse.json(testPaymentsDisabledJson(), { status: 403 });
    }
    const req = getMockRequest(requestId);
    if (!req) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }
    if (req.status !== "in_progress") {
      return NextResponse.json(
        { success: false, error: "Payment is only available for orders in progress" },
        { status: 400 }
      );
    }
    const offer = getMockOffers(requestId).find((o) => o.status === "accepted");
    if (!offer) {
      return NextResponse.json({ success: false, error: "No accepted offer" }, { status: 400 });
    }
    try {
      const body = (await request.json().catch(() => ({}))) as { external_reference?: string };
      if (!getMockOrderPayment(requestId)) {
        initDemoOrderPayment({
          requestId,
          customerId: req.customer_id,
          providerId: offer.provider_id,
          orderAmount: Number(offer.price),
          currency: offer.currency,
          requestTitle: req.title,
        });
      }
      const data = simulateDemoPayment({
        requestId,
        offerId: offer.id,
        customerId: req.customer_id,
        providerId: offer.provider_id,
        grossAmount: Number(offer.price),
        currency: offer.currency,
        externalReference: body.external_reference,
      });
      markMockOrderPaid(requestId, data.external_reference ?? data.payment_id);
      return NextResponse.json({
        success: true,
        ...data,
        order_payment_status: "paid" as const,
        is_test: true,
      });
    } catch (e) {
      return NextResponse.json(
        { success: false, error: e instanceof Error ? e.message : "Payment failed" },
        { status: 400 }
      );
    }
  }

  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const admin = await isPlatformAdmin(auth.supabase, auth.user.id);

  let externalReference: string | undefined;
  try {
    const body = (await request.json()) as {
      external_reference?: string;
      amount?: number;
      currency?: string;
    };
    if (body.external_reference?.trim()) {
      externalReference = body.external_reference.trim();
    }
    void body.amount;
    void body.currency;
  } catch {
    /* empty body ok */
  }

  const { data: order, error: orderError } = await auth.supabase
    .from("requests")
    .select("id, customer_id, status, order_payment_status, is_test")
    .eq("id", requestId)
    .maybeSingle();

  if (orderError || !order) {
    if (isMissingColumnError(orderError)) {
      return NextResponse.json(
        { success: false, error: "Order payment schema is unavailable" },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
  }

  const isOrderOwner = order.customer_id === auth.user.id;
  const isTestOrder = Boolean((order as { is_test?: boolean }).is_test);

  // Hard split: is_test → ONLY prod-safe simulator; !is_test → ONLY preview simulator.
  // Never cross LIVE↔TEST automatically.
  const previewTestOk =
    !isTestOrder &&
    canInvokeSimulatedOrderPayment({
      email: auth.user.email,
      isPlatformAdmin: admin,
      isOrderOwner,
    });
  const prodSafeOk =
    isTestOrder &&
    canInvokeProdSafeTestPayment({
      email: auth.user.email,
      isOrderOwner,
      isTestOrder: true,
    });

  if (!previewTestOk && !prodSafeOk) {
    if (isTestOrder) {
      return NextResponse.json(prodSafeTestDeniedJson(), { status: 403 });
    }
    if (areTestPaymentsEnabled()) {
      return NextResponse.json(testPaymentsActorDeniedJson(), { status: 403 });
    }
    return NextResponse.json(testPaymentsDisabledJson(), { status: 403 });
  }

  const { data: offer } = await auth.supabase
    .from("offers")
    .select("price, currency")
    .eq("request_id", requestId)
    .eq("status", "accepted")
    .maybeSingle();

  if (!offer) {
    return NextResponse.json({ success: false, error: "No accepted offer" }, { status: 400 });
  }

  const existingPayment = await getPaymentForRequest(auth.supabase, requestId);

  const authz = authorizeTestOrderPayment({
    authenticatedUserId: auth.user.id,
    orderCustomerId: order.customer_id,
    orderStatus: order.status,
    orderPaymentStatus: order.order_payment_status,
    existingPaymentStatus: existingPayment?.status ?? null,
    expectedGrossAmount: Number(offer.price),
    isPlatformAdmin: admin && previewTestOk,
  });

  if (!authz.ok) {
    // Idempotent success if already paid via look_test
    if (
      authz.error === "Order is already paid" &&
      existingPayment &&
      (existingPayment as { is_test?: boolean; payment_method?: string }).is_test
    ) {
      return NextResponse.json({
        success: true,
        payment_id: existingPayment.id,
        request_id: requestId,
        amount_gross: existingPayment.amount_gross,
        platform_fee: existingPayment.platform_fee,
        provider_amount: existingPayment.provider_amount,
        currency: existingPayment.currency,
        status: existingPayment.status,
        is_test: true,
        payment_provider: "look_test",
        order_payment_status: "paid",
        idempotent: true,
      });
    }
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  const result = prodSafeOk
    ? await executeProdSafeTestPayment(auth.supabase, requestId, externalReference)
    : await simulateTestPayment(auth.supabase, requestId, externalReference);

  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
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
    is_test: true,
    order_payment_status: result.data.order_payment_status ?? "paid",
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  if (isDemoMode()) {
    const payment = getDemoPaymentForRequest(requestId);
    const mockOrder = getMockOrderPayment(requestId);
    return NextResponse.json({
      success: true,
      payment,
      order_payment_status: mockOrder?.order_payment_status ?? (payment ? "paid" : "unpaid"),
      test_payments_enabled: areTestPaymentsEnabled(),
      prod_safe_test_payments_enabled: false,
    });
  }

  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const [payment, snapshot] = await Promise.all([
    getPaymentForRequest(auth.supabase, requestId),
    getOrderPaymentSnapshot(auth.supabase, requestId),
  ]);

  return NextResponse.json({
    success: true,
    payment,
    order_payment_status: snapshot?.orderPaymentStatus ?? (payment ? "paid" : "unpaid"),
    is_test: snapshot?.isTest ?? false,
    test_payments_enabled: areTestPaymentsEnabled(),
    prod_safe_test_payments_enabled: Boolean(
      process.env.ENABLE_PROD_TEST_PAYMENTS?.trim() === "true"
    ),
  });
}
