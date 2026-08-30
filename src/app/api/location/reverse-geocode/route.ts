import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { reverseGeocode } from "@/lib/location/reverse-geocode";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  locale: z.enum(["ru", "en"]).optional(),
});

/**
 * Server-only reverse geocode — never put provider secrets in the client bundle.
 * Provider is swappable via LOCATION_GEOCODER_PROVIDER (default: nominatim).
 */
export async function POST(request: Request) {
  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid coordinates" },
      { status: 400 }
    );
  }

  const result = await reverseGeocode(
    parsed.data.lat,
    parsed.data.lng,
    parsed.data.locale
  );

  if (!result) {
    return NextResponse.json(
      { success: false, error: "Geocode unavailable" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, result });
}
