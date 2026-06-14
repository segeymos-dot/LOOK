import { fetchOfferById } from "@/lib/data/fetch-offer";
import { getUserIdFromAccessToken } from "@/lib/auth/jwt";
import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ offerId: string }> }
) {
  try {
    const { offerId } = await params;
    const requestId = new URL(request.url).searchParams.get("requestId");

    if (!requestId) {
      return NextResponse.json(
        { error: "requestId is required" },
        { status: 400 }
      );
    }

    const accessToken = request.headers
      .get("Authorization")
      ?.replace(/^Bearer\s+/i, "");

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = getUserIdFromAccessToken(accessToken);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const supabase = createAuthenticatedClient(accessToken);
    const offer = await fetchOfferById(supabase, offerId, requestId);

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("offer_id", offerId)
      .maybeSingle();

    return NextResponse.json({
      offer,
      conversationId: conversation?.id ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load offer" },
      { status: 500 }
    );
  }
}
