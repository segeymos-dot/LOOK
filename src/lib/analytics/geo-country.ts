/**
 * Server-side country from edge / platform geo headers.
 * Never uses GPS. Never exposes raw IP to the client.
 */

export type RequestCountry = {
  countryCode: string;
  countryName: string;
};

const COUNTRY_NAMES: Record<string, string> = {
  AE: "United Arab Emirates",
  AF: "Afghanistan",
  AL: "Albania",
  AM: "Armenia",
  AR: "Argentina",
  AT: "Austria",
  AU: "Australia",
  AZ: "Azerbaijan",
  BA: "Bosnia and Herzegovina",
  BD: "Bangladesh",
  BE: "Belgium",
  BG: "Bulgaria",
  BH: "Bahrain",
  BR: "Brazil",
  BY: "Belarus",
  CA: "Canada",
  CH: "Switzerland",
  CL: "Chile",
  CN: "China",
  CO: "Colombia",
  CY: "Cyprus",
  CZ: "Czechia",
  DE: "Germany",
  DK: "Denmark",
  DZ: "Algeria",
  EE: "Estonia",
  EG: "Egypt",
  ES: "Spain",
  FI: "Finland",
  FR: "France",
  GB: "United Kingdom",
  GE: "Georgia",
  GR: "Greece",
  HK: "Hong Kong",
  HR: "Croatia",
  HU: "Hungary",
  ID: "Indonesia",
  IE: "Ireland",
  IL: "Israel",
  IN: "India",
  IQ: "Iraq",
  IR: "Iran",
  IS: "Iceland",
  IT: "Italy",
  JO: "Jordan",
  JP: "Japan",
  KG: "Kyrgyzstan",
  KH: "Cambodia",
  KR: "South Korea",
  KW: "Kuwait",
  KZ: "Kazakhstan",
  LB: "Lebanon",
  LK: "Sri Lanka",
  LT: "Lithuania",
  LU: "Luxembourg",
  LV: "Latvia",
  MA: "Morocco",
  MD: "Moldova",
  ME: "Montenegro",
  MK: "North Macedonia",
  MM: "Myanmar",
  MN: "Mongolia",
  MX: "Mexico",
  MY: "Malaysia",
  NG: "Nigeria",
  NL: "Netherlands",
  NO: "Norway",
  NP: "Nepal",
  NZ: "New Zealand",
  OM: "Oman",
  PH: "Philippines",
  PK: "Pakistan",
  PL: "Poland",
  PT: "Portugal",
  QA: "Qatar",
  RO: "Romania",
  RS: "Serbia",
  RU: "Russia",
  SA: "Saudi Arabia",
  SE: "Sweden",
  SG: "Singapore",
  SI: "Slovenia",
  SK: "Slovakia",
  TH: "Thailand",
  TJ: "Tajikistan",
  TM: "Turkmenistan",
  TR: "Turkey",
  TW: "Taiwan",
  UA: "Ukraine",
  US: "United States",
  UZ: "Uzbekistan",
  VN: "Vietnam",
  ZA: "South Africa",
  XX: "Unknown",
};

export function countryNameFromCode(code: string): string {
  const normalized = normalizeCountryCode(code);
  return COUNTRY_NAMES[normalized] ?? (normalized === "XX" ? "Unknown" : normalized);
}

export function normalizeCountryCode(raw: string | null | undefined): string {
  const code = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) return code;
  return "XX";
}

/** Prefer Vercel / Cloudflare / common edge geo headers. */
export function countryFromRequest(request: Request): RequestCountry {
  const headers = request.headers;
  const raw =
    headers.get("x-vercel-ip-country") ||
    headers.get("cf-ipcountry") ||
    headers.get("x-country-code") ||
    headers.get("x-geo-country") ||
    "";
  const countryCode = normalizeCountryCode(raw);
  return {
    countryCode,
    countryName: countryNameFromCode(countryCode),
  };
}

/** Flag emoji from ISO-2 (regional indicator symbols). XX → 🌐 */
export function countryFlagEmoji(code: string): string {
  const normalized = normalizeCountryCode(code);
  if (normalized === "XX") return "🌐";
  const a = normalized.charCodeAt(0);
  const b = normalized.charCodeAt(1);
  if (a < 65 || a > 90 || b < 65 || b > 90) return "🌐";
  return String.fromCodePoint(127397 + a, 127397 + b);
}
