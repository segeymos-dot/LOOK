import { requireAdminContext } from "@/lib/admin/require-admin";
import { getAdminDisputeDetail } from "@/lib/admin/disputes";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminContext(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const admin = auth.ctx.adminClient ?? auth.ctx.supabase;

  try {
    const dispute = await getAdminDisputeDetail(admin, id);
    if (!dispute) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, dispute });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to load dispute" },
      { status: 500 }
    );
  }
}
