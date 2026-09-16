import { requireAdminContext } from "@/lib/admin/require-admin";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Platform-admin only: mark one unpaid open/in_progress order as is_test.
 * Uses admin_mark_request_is_test RPC (migration 070). Never creates payment.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const gate = await requireAdminContext(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { data, error } = await gate.ctx.supabase.rpc("admin_mark_request_is_test", {
    p_request_id: requestId,
  });

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath(`/requests/${requestId}/payment`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/stats");

  return NextResponse.json({ success: true, ...(data as object) });
}
