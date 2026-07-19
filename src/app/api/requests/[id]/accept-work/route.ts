import { createClient } from "@/lib/supabase/server";
import { acceptWork } from "@/lib/data/work-actions";
import { getMockRequest } from "@/lib/mock/data";
import { markMockOrderCompleted } from "@/lib/mock/order-payments";
import { isDemoMode } from "@/lib/config";
import { PAYMENT_REQUIRED_CODE } from "@/lib/payments/work-submission-guard";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  if (isDemoMode()) {
    const req = getMockRequest(requestId);
    if (!req) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }
    markMockOrderCompleted(requestId);
    return NextResponse.json({
      success: true,
      status: "completed",
      order_payment_status: "completed",
    });
  }

  const supabase = await createClient();
  const result = await acceptWork(supabase, requestId);

  if (!result.success) {
    const status = result.code === PAYMENT_REQUIRED_CODE ? 403 : 400;
    return NextResponse.json(
      { success: false, error: result.error, code: result.code },
      { status }
    );
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath(`/requests/${requestId}/payment`);
  revalidatePath("/my/requests");
  revalidatePath("/my/offers");
  revalidatePath("/profile");
  revalidatePath("/finance/transactions");

  return NextResponse.json({
    success: true,
    status: result.status,
    payment_id: result.paymentId,
    order_payment_status: result.orderPaymentStatus ?? "completed",
    already_completed: result.alreadyCompleted ?? false,
  });
}
