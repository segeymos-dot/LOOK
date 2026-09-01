import { NextResponse, type NextRequest } from "next/server";
import { requireAdminContext } from "@/lib/admin/require-admin";
import { fetchVisitorsByCountry } from "@/lib/analytics/visitors-by-country";
import { getServerLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireAdminContext(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const range = request.nextUrl.searchParams.get("range");
    const locale = await getServerLocale();
    const stats = await fetchVisitorsByCountry(
      gate.ctx.supabase,
      range,
      locale === "ru" ? "ru" : "en"
    );
    return NextResponse.json(
      {
        success: true,
        total_visits: stats.total_visits,
        unique_visitors: stats.unique_visitors,
        countries_count: stats.countries_count,
        range: stats.range,
        percentage_of: stats.percentage_of,
        countries: stats.countries,
        // Debug-only; UI ignores these fields.
        human_visits: stats.human_visits,
        technical_visits: stats.technical_visits,
        bot_visits: stats.bot_visits,
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
