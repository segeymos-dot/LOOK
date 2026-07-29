import { NextResponse, type NextRequest } from "next/server";
import { fetchAdminUserStats } from "@/lib/admin/user-stats";
import { requireAdminContext } from "@/lib/admin/require-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireAdminContext(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const stats = await fetchAdminUserStats(gate.ctx.supabase);
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load statistics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
