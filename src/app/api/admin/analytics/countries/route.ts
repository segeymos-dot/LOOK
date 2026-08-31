import { NextResponse, type NextRequest } from "next/server";
import { requireAdminContext } from "@/lib/admin/require-admin";
import { fetchVisitorsByCountry } from "@/lib/analytics/visitors-by-country";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireAdminContext(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const range = request.nextUrl.searchParams.get("range");
    const stats = await fetchVisitorsByCountry(gate.ctx.supabase, range);
    return NextResponse.json(
      {
        success: true,
        total_visits: stats.total_visits,
        unique_visitors: stats.unique_visitors,
        countries_count: stats.countries_count,
        range: stats.range,
        countries: stats.countries,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load country analytics";
    console.error("[api/admin/analytics/countries]", message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
