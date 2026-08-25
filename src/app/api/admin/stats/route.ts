import { NextResponse, type NextRequest } from "next/server";
import {
  fetchAdminUserStats,
  toAdminPlatformStatsPayload,
} from "@/lib/admin/user-stats";
import { requireAdminContext } from "@/lib/admin/require-admin";

export const dynamic = "force-dynamic";

/**
 * Canonical admin platform statistics.
 * Home tiles, /admin/stats, and pulse card must all use this endpoint
 * (or /api/admin/user-stats which shares the same fetchAdminUserStats source).
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdminContext(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const stats = await fetchAdminUserStats(gate.ctx.supabase, gate.ctx.adminClient);
    const counters = toAdminPlatformStatsPayload(stats);
    return NextResponse.json({
      success: true,
      ...counters,
      stats,
      counters,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load statistics";
    console.error("[api/admin/stats]", message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
