import type { SupabaseClient } from "@supabase/supabase-js";
import {
  countryFlagEmoji,
  countryNameFromCode,
  normalizeCountryCode,
} from "@/lib/analytics/geo-country";

export type VisitorsByCountryRange = "today" | "7d" | "30d" | "all";

export type CountryTrafficRow = {
  country_code: string;
  country_name: string;
  flag: string;
  visits: number;
  unique_visitors: number;
  registered_users: number;
  guests: number;
  /** Share of total unique visitors in the selected range. */
  percentage: number;
  percentage_of: "unique_visitors";
};

export type VisitorsByCountryStats = {
  total_visits: number;
  unique_visitors: number;
  countries_count: number;
  range: VisitorsByCountryRange;
  countries: CountryTrafficRow[];
  percentage_of: "unique_visitors";
};

function parseRange(raw: string | null | undefined): VisitorsByCountryRange {
  const value = String(raw ?? "30d").trim().toLowerCase();
  if (value === "today" || value === "7d" || value === "30d" || value === "all") {
    return value;
  }
  return "30d";
}

export async function fetchVisitorsByCountry(
  supabase: SupabaseClient,
  rangeInput?: string | null,
  locale: "en" | "ru" = "en"
): Promise<VisitorsByCountryStats> {
  const range = parseRange(rangeInput);
  const { data, error } = await supabase.rpc("get_admin_visitors_by_country", {
    p_range: range,
  });
  if (error) throw new Error(error.message);

  const raw = (data ?? {}) as {
    total_visits?: number;
    unique_visitors?: number;
    countries_count?: number;
    range?: string;
    countries?: Array<{
      country_code?: string;
      country_name?: string;
      visits?: number;
      unique_visitors?: number;
      registered_users?: number;
      guests?: number;
      percentage?: number;
    }> | null;
  };

  const countries = (raw.countries ?? []).map((row) => {
    const code = normalizeCountryCode(row.country_code);
    return {
      country_code: code,
      country_name: countryNameFromCode(code, locale),
      flag: countryFlagEmoji(code),
      visits: Number(row.visits ?? 0),
      unique_visitors: Number(row.unique_visitors ?? 0),
      registered_users: Number(row.registered_users ?? 0),
      guests: Number(row.guests ?? 0),
      percentage: Number(row.percentage ?? 0),
      percentage_of: "unique_visitors" as const,
    };
  });

  // Known countries first; unknown last.
  countries.sort((a, b) => {
    if (a.country_code === "XX" && b.country_code !== "XX") return 1;
    if (b.country_code === "XX" && a.country_code !== "XX") return -1;
    return b.unique_visitors - a.unique_visitors || b.visits - a.visits;
  });

  return {
    total_visits: Number(raw.total_visits ?? 0),
    unique_visitors: Number(raw.unique_visitors ?? 0),
    countries_count: Number(raw.countries_count ?? countries.length),
    range: parseRange(raw.range ?? range),
    countries,
    percentage_of: "unique_visitors",
  };
}
