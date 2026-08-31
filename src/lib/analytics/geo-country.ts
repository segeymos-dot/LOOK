/**
 * Server-side country from edge / platform geo headers + IP fallback.
 * Never uses GPS. Never stores raw IP in analytics.
 */

export type GeoSource = "vercel" | "cloudflare" | "platform" | "ip-fallback" | "unknown";

export type ResolvedCountry = {
  countryCode: string;
  countryName: string;
  source: GeoSource;
};

const COUNTRY_NAMES_EN: Record<string, string> = {
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

const COUNTRY_NAMES_RU: Record<string, string> = {
  AE: "ОАЭ",
  AM: "Армения",
  AT: "Австрия",
  AU: "Австралия",
  AZ: "Азербайджан",
  BE: "Бельгия",
  BG: "Болгария",
  BR: "Бразилия",
  BY: "Беларусь",
  CA: "Канада",
  CH: "Швейцария",
  CN: "Китай",
  CY: "Кипр",
  CZ: "Чехия",
  DE: "Германия",
  DK: "Дания",
  EE: "Эстония",
  EG: "Египет",
  ES: "Испания",
  FI: "Финляндия",
  FR: "Франция",
  GB: "Великобритания",
  GE: "Грузия",
  GR: "Греция",
  HK: "Гонконг",
  HR: "Хорватия",
  HU: "Венгрия",
  ID: "Индонезия",
  IE: "Ирландия",
  IL: "Израиль",
  IN: "Индия",
  IT: "Италия",
  JP: "Япония",
  KG: "Кыргызстан",
  KR: "Южная Корея",
  KZ: "Казахстан",
  LT: "Литва",
  LV: "Латвия",
  MD: "Молдова",
  MX: "Мексика",
  MY: "Малайзия",
  NL: "Нидерланды",
  NO: "Норвегия",
  NZ: "Новая Зеландия",
  PH: "Филиппины",
  PK: "Пакистан",
  PL: "Польша",
  PT: "Португалия",
  RO: "Румыния",
  RS: "Сербия",
  RU: "Россия",
  SA: "Саудовская Аравия",
  SE: "Швеция",
  SG: "Сингапур",
  TH: "Таиланд",
  TR: "Турция",
  UA: "Украина",
  US: "США",
  UZ: "Узбекистан",
  VN: "Вьетнам",
  XX: "Страна не определена",
};

export function countryNameFromCode(
  code: string,
  locale: "en" | "ru" = "en"
): string {
  const normalized = normalizeCountryCode(code);
  if (locale === "ru") {
    return (
      COUNTRY_NAMES_RU[normalized] ??
      COUNTRY_NAMES_EN[normalized] ??
      (normalized === "XX" ? "Страна не определена" : normalized)
    );
  }
  return COUNTRY_NAMES_EN[normalized] ?? (normalized === "XX" ? "Unknown" : normalized);
}

/** @deprecated use countryNameFromCode(code, 'en') */
export function countryNameFromCodeEn(code: string): string {
  return countryNameFromCode(code, "en");
}

export function normalizeCountryCode(raw: string | null | undefined): string {
  const code = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (code === "UK") return "GB";
  if (/^[A-Z]{2}$/.test(code)) return code;
  return "XX";
}

function headerCountry(
  request: Request
): { code: string; source: GeoSource } | null {
  const headers = request.headers;
  const vercel = headers.get("x-vercel-ip-country");
  if (vercel && normalizeCountryCode(vercel) !== "XX") {
    return { code: normalizeCountryCode(vercel), source: "vercel" };
  }
  const cf = headers.get("cf-ipcountry");
  if (cf && cf.toUpperCase() !== "XX" && normalizeCountryCode(cf) !== "XX") {
    return { code: normalizeCountryCode(cf), source: "cloudflare" };
  }
  const platform =
    headers.get("x-look-country-code") ||
    headers.get("x-country-code") ||
    headers.get("x-geo-country");
  if (platform && normalizeCountryCode(platform) !== "XX") {
    return { code: normalizeCountryCode(platform), source: "platform" };
  }
  return null;
}

/** Extract client IP for lookup only — never persist. */
export function clientIpFromRequest(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim() ?? "";
    if (first && !isLocalIp(first)) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim() ?? "";
  if (realIp && !isLocalIp(realIp)) return realIp;
  const vercelFwd = request.headers.get("x-vercel-forwarded-for")?.trim() ?? "";
  if (vercelFwd) {
    const first = vercelFwd.split(",")[0]?.trim() ?? "";
    if (first && !isLocalIp(first)) return first;
  }
  return null;
}

function isLocalIp(ip: string): boolean {
  return (
    ip === "::1" ||
    ip === "127.0.0.1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd")
  );
}

async function countryFromIpFallback(ip: string): Promise<ResolvedCountry | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code,country`,
      { signal: controller.signal, cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      success?: boolean;
      country_code?: string;
      country?: string;
    };
    if (!data.success) return null;
    const code = normalizeCountryCode(data.country_code);
    if (code === "XX") return null;
    return {
      countryCode: code,
      countryName: data.country?.trim() || countryNameFromCode(code, "en"),
      source: "ip-fallback",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Sync header-only resolve (no network). */
export function countryFromRequest(request: Request): ResolvedCountry {
  const hit = headerCountry(request);
  if (hit) {
    return {
      countryCode: hit.code,
      countryName: countryNameFromCode(hit.code, "en"),
      source: hit.source,
    };
  }
  return { countryCode: "XX", countryName: "Unknown", source: "unknown" };
}

/**
 * Full resolver: headers first, then server-side IP geo fallback.
 * Country is resolved BEFORE session write by the caller.
 */
export async function resolveCountry(request: Request): Promise<ResolvedCountry> {
  const fromHeaders = countryFromRequest(request);
  if (fromHeaders.countryCode !== "XX") return fromHeaders;

  const ip = clientIpFromRequest(request);
  if (!ip) {
    return { countryCode: "XX", countryName: "Unknown", source: "unknown" };
  }

  const fromIp = await countryFromIpFallback(ip);
  if (fromIp) return fromIp;

  return { countryCode: "XX", countryName: "Unknown", source: "unknown" };
}

/** Inspect geo headers without exposing IP (admin diagnostics). */
export function geoHeaderPresence(request: Request): {
  xVercelIpCountry: boolean;
  xVercelIpCountryValue: string | null;
  cfIpCountry: boolean;
  xForwardedForPresent: boolean;
  runtime: string;
} {
  const vercel = request.headers.get("x-vercel-ip-country");
  const cf = request.headers.get("cf-ipcountry");
  return {
    xVercelIpCountry: Boolean(vercel && vercel.trim()),
    xVercelIpCountryValue: vercel?.trim().toUpperCase() || null,
    cfIpCountry: Boolean(cf && cf.trim()),
    xForwardedForPresent: Boolean(request.headers.get("x-forwarded-for")),
    runtime: typeof (globalThis as { EdgeRuntime?: string }).EdgeRuntime === "string"
      ? "edge"
      : "nodejs",
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
