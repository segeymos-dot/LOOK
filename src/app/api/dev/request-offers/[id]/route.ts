import { getRequestOffersForPage } from "@/lib/data/request-offers-server";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  const result = await getRequestOffersForPage(id);

  return NextResponse.json({
    userId: user?.id ?? null,
    userError: userError?.message ?? null,
    result,
  });
}
