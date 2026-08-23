import { getAdminCustomerRecord } from "@/lib/admin/directory";
import { requireAdminContext } from "@/lib/admin/require-admin";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminContext(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await context.params;
  try {
    const record = await getAdminCustomerRecord(
      gate.ctx.supabase,
      gate.ctx.adminClient,
      id
    );
    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, record });
  } catch {
    return NextResponse.json({ error: "Failed to load data" }, { status: 500 });
  }
}
