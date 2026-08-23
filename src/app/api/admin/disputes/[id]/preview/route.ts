import { requireAdminContext } from "@/lib/admin/require-admin";
import { previewDisputeSettlement } from "@/lib/data/admin-dispute-actions";
import type { DisputeResolutionDecision } from "@/types";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminContext(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const admin = auth.ctx.adminClient;
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "SUPABASE_SERVICE_ROLE_KEY is required" },
      { status: 500 }
    );
  }

  const { id } = await params;
  let body: {
    decision?: DisputeResolutionDecision;
    customerRefund?: number;
    providerRelease?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.decision) {
    return NextResponse.json({ success: false, error: "decision is required" }, { status: 400 });
  }

  const result = await previewDisputeSettlement(admin, {
    disputeId: id,
    decision: body.decision,
    customerRefund: body.customerRefund,
    providerRelease: body.providerRelease,
  });

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, preview: result.preview });
}
