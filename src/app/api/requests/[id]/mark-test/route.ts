import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { isPlatformAdmin } from "@/lib/data/finance-actions";
import {
  canMarkOrderAsTest,
  prodSafeTestDeniedJson,
} from "@/lib/payments/test-payments-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/**
 * Mark an owned open/in-progress unpaid order as is_test.
 * Allowlist checked here; RPC runs as service_role (migration 070).
 * Never creates payment / never touches Stripe.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const admin = await isPlatformAdmin(auth.supabase, auth.user.id);
  if (!canMarkOrderAsTest({ email: auth.user.email, isPlatformAdmin: admin })) {
    return NextResponse.json(prodSafeTestDeniedJson(), { status: 403 });
  }

  const { data: order, error: orderError } = await auth.supabase
    .from("requests")
    .select("id, customer_id, status, order_payment_status, is_test")
    .eq("id", requestId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json(
      { success: false, error: "Request not found" },
      { status: 404 }
    );
  }

  if (order.customer_id !== auth.user.id && !admin) {
    return NextResponse.json(
      { success: false, error: "Not authorized" },
      { status: 403 }
    );
  }

  const service = createAdminClient();
  if (!service) {
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 }
    );
  }

  const { data, error } = await service.rpc("set_request_is_test", {
    p_request_id: requestId,
    p_is_test: true,
  });

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath(`/requests/${requestId}/payment`);
  revalidatePath("/orders");
  revalidatePath("/search");

  return NextResponse.json({ success: true, ...(data as object) });
}
