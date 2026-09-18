import { providerDeclineSelectedJob } from "@/lib/data/offer-actions";
import { getUserIdFromAccessToken } from "@/lib/auth/jwt";
import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/** Selected provider declines unpaid/pre-work job — reopens order. */
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
  const result = await providerDeclineSelectedJob(supabase, requestId);
  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/search");
  revalidatePath("/my/offers");
  revalidatePath("/my/work");

  return NextResponse.json({
    success: true,
    request_id: result.requestId,
    status: "open",
    declined_offer_id: result.offerId,
    restored_pending_offers: result.restoredPendingOffers,
  });
}
