import { unassignSelectedProvider } from "@/lib/data/offer-actions";
import { getUserIdFromAccessToken } from "@/lib/auth/jwt";
import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/**
 * Customer unassigns the selected provider before payment/work.
 * Reopens the request (status=open). Does not delete chats or the order.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const accessToken = request.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!accessToken) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const userId = getUserIdFromAccessToken(accessToken);
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const supabase = createAuthenticatedClient(accessToken);

  const { data: order, error: orderError } = await supabase
    .from("requests")
    .select("id, customer_id, status, order_payment_status")
    .eq("id", requestId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json(
      { success: false, error: "Request not found" },
      { status: 404 }
    );
  }

  if (order.customer_id !== userId) {
    return NextResponse.json(
      { success: false, error: "Not authorized" },
      { status: 403 }
    );
  }

  const result = await unassignSelectedProvider(supabase, requestId);
  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/search");
  revalidatePath("/my/orders");
  revalidatePath("/my/requests");

  return NextResponse.json({
    success: true,
    request_id: result.requestId,
    status: "open",
    previous_provider_id: result.previousProviderId,
    restored_pending_offers: result.restoredPendingOffers,
  });
}
