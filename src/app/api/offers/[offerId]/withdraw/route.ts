import {
  providerWithdrawOffer,
} from "@/lib/data/offer-actions";
import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/** Provider withdraws a pending offer. Request stays open. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ offerId: string }> }
) {
  const { offerId } = await params;
  const accessToken = request.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!accessToken) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const supabase = createAuthenticatedClient(accessToken);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const result = await providerWithdrawOffer(supabase, offerId);
  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  revalidatePath(`/requests/${result.requestId}`);
  revalidatePath("/search");
  revalidatePath("/my/offers");

  return NextResponse.json({
    success: true,
    offer_id: result.offerId,
    request_id: result.requestId,
    offer_status: result.offerStatus,
    request_status: result.requestStatus,
  });
}
