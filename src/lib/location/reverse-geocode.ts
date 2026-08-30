import type {
  ReverseGeocodeProvider,
  ReverseGeocodeResult,
} from "@/lib/location/types";

/**
 * OpenStreetMap Nominatim — no API key required.
 * Server-side only. Respect usage policy (User-Agent + rate limits).
 * China: swap via LOCATION_GEOCODER_PROVIDER later (baidu/amap/tencent).
 */
export const nominatimProvider: ReverseGeocodeProvider = {
  id: "nominatim",
  async reverseGeocode(lat, lng, locale = "en") {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("zoom", "10");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", locale.startsWith("ru") ? "ru" : "en");

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "LOOK-Marketplace/1.0 (https://lookcruise.com; location)",
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      address?: Record<string, string>;
    };
    const a = data.address ?? {};
    const city =
      a.city ||
      a.town ||
      a.village ||
      a.municipality ||
      a.city_district ||
      a.county ||
      null;
    const region = a.state || a.region || a.province || a.state_district || null;
    const country = a.country || null;
    const country_code = a.country_code
      ? a.country_code.toUpperCase()
      : null;

    return {
      country_code,
      country,
      region,
      city,
      provider_id: "nominatim",
    } satisfies ReverseGeocodeResult;
  },
};

/**
 * Provider registry — extend here for China-specific fallbacks
 * (Baidu / AutoNavi / Tencent) without changing UI callers.
 */
const providers: Record<string, ReverseGeocodeProvider> = {
  nominatim: nominatimProvider,
  // baidu: baiduProvider,
  // amap: amapProvider,
  // tencent: tencentProvider,
};

export function getReverseGeocodeProvider(): ReverseGeocodeProvider {
  const id = (process.env.LOCATION_GEOCODER_PROVIDER || "nominatim").trim();
  return providers[id] ?? nominatimProvider;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  locale?: string
): Promise<ReverseGeocodeResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  try {
    return await getReverseGeocodeProvider().reverseGeocode(lat, lng, locale);
  } catch {
    return null;
  }
}
