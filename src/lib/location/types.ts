/** Shared location types — one record per auth user (customer/provider/both). */

export type LocationSource = "gps" | "manual" | "unknown";

export type LocationPermissionState = "prompt" | "granted" | "denied";

export type ProfileLocation = {
  latitude: number | null;
  longitude: number | null;
  location_accuracy_m: number | null;
  country_code: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  location_source: LocationSource | null;
  location_permission_state: LocationPermissionState | null;
  location_updated_at: string | null;
};

export type ReverseGeocodeResult = {
  country_code: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  provider_id: string;
};

export type ReverseGeocodeProvider = {
  /** Stable id, e.g. nominatim | baidu | amap | tencent */
  id: string;
  reverseGeocode(
    lat: number,
    lng: number,
    locale?: string
  ): Promise<ReverseGeocodeResult | null>;
};

/** Fields safe to show in marketplace UI (never precise GPS). */
export type PublicLocationDisplay = {
  city: string | null;
  region: string | null;
  country: string | null;
  country_code: string | null;
};

export function toPublicLocationDisplay(
  loc: Pick<ProfileLocation, "city" | "region" | "country" | "country_code">
): PublicLocationDisplay {
  return {
    city: loc.city,
    region: loc.region,
    country: loc.country,
    country_code: loc.country_code,
  };
}

export function formatLocationLabel(
  loc: Pick<ProfileLocation, "city" | "region" | "country">
): string | null {
  const parts = [loc.city, loc.region, loc.country].filter(
    (p): p is string => Boolean(p && p.trim())
  );
  if (parts.length === 0) return null;
  // Prefer city + country when both present
  if (loc.city && loc.country) return `${loc.city}, ${loc.country}`;
  return parts.join(", ");
}
