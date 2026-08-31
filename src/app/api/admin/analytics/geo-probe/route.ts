import { NextResponse, type NextRequest } from "next/server";
import { requireAdminContext } from "@/lib/admin/require-admin";
import {
  geoHeaderPresence,
  resolveCountry,
} from "@/lib/analytics/geo-country";

export const dynamic = "force-dynamic";

/**
 * Admin-only READ diagnostics for production geo headers.
 * Does not expose raw IP.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdminContext(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const presence = geoHeaderPresence(request);
  const resolved = await resolveCountry(request);

  return NextResponse.json(
    {
      success: true,
      x_vercel_ip_country_present: presence.xVercelIpCountry,
      x_vercel_ip_country_value: presence.xVercelIpCountryValue,
      cf_ipcountry_present: presence.cfIpCountry,
      x_forwarded_for_present: presence.xForwardedForPresent,
      runtime: presence.runtime,
      resolved_country_code: resolved.countryCode,
      resolved_country_name: resolved.countryName,
      resolved_source: resolved.source,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
