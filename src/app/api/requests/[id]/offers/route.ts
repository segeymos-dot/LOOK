import { fetchRequestOffers } from "@/lib/data/request-offers";
import { getUserIdFromAccessToken } from "@/lib/auth/jwt";
import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const accessToken = request.headers
      .get("Authorization")
      ?.replace(/^Bearer\s+/i, "");

    if (!accessToken) {
      return NextResponse.json({
        offers: [],
        conversations: {},
        userId: null,
      });
    }

    const userId = getUserIdFromAccessToken(accessToken);
    if (!userId) {
      return NextResponse.json(
        { offers: [], conversations: {}, userId: null, error: "Invalid token" },
        { status: 401 }
      );
    }

    const supabase = createAuthenticatedClient(accessToken);
    const result = await fetchRequestOffers(supabase, id, userId);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { offers: [], conversations: {}, error: "Failed to load offers" },
      { status: 500 }
    );
  }
}
