import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const accessToken = request.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAuthenticatedClient(accessToken);
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "*, customer:profiles!conversations_customer_id_fkey(*), provider:profiles!conversations_provider_id_fkey(*), request:requests(title)"
    )
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ conversation: data });
}
