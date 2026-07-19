import { getWorkLifecycleState } from "@/lib/data/work-lifecycle-state";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: request }, lifecycle] = await Promise.all([
    supabase
      .from("requests")
      .select("id, customer_id, status, currency")
      .eq("id", requestId)
      .maybeSingle(),
    getWorkLifecycleState(supabase, requestId),
  ]);

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: acceptedOffer } = await supabase
    .from("offers")
    .select("provider_id, price, currency")
    .eq("request_id", requestId)
    .eq("status", "accepted")
    .maybeSingle();

  const isParty =
    user.id === request.customer_id || user.id === acceptedOffer?.provider_id;

  if (!isParty) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    requestId,
    customerId: request.customer_id,
    dbStatus: request.status,
    effectiveStatus: lifecycle?.effectiveStatus ?? request.status,
    revisionFeedback: lifecycle?.revisionFeedback ?? null,
    acceptedProviderId: acceptedOffer?.provider_id ?? null,
    grossAmount: Number(acceptedOffer?.price ?? 0),
    currency: acceptedOffer?.currency ?? request.currency,
  });
}
