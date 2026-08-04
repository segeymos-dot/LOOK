import { requireAdminContext } from "@/lib/admin/require-admin";
import { resolveDisputeAsAdmin } from "@/lib/data/admin-dispute-actions";
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
    resolutionNote?: string;
    customerRefund?: number;
    providerRelease?: number;
    idempotencyKey?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.decision || !body.resolutionNote?.trim()) {
    return NextResponse.json(
      { success: false, error: "decision and resolutionNote are required" },
      { status: 400 }
    );
  }

  const result = await resolveDisputeAsAdmin(admin, auth.ctx.supabase, {
    disputeId: id,
    adminId: auth.ctx.user.id,
    decision: body.decision,
    resolutionNote: body.resolutionNote,
    customerRefund: body.customerRefund,
    providerRelease: body.providerRelease,
    idempotencyKey: body.idempotencyKey ?? `${id}:${body.decision}`,
  });

  if (!result.success) {
    const status =
      result.code === "TEST_PAYMENTS_DISABLED" ? 403 : 400;
    return NextResponse.json(
      { success: false, error: result.error, code: result.code },
      { status }
    );
  }

  return NextResponse.json({
    success: true,
    result: result.result,
    alreadyResolved: result.alreadyResolved,
  });
}
