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
  percentage: number;
};

export type VisitorsByCountryStats = {
  total_visits: number;
  unique_visitors: number;
  countries_count: number;
  range: VisitorsByCountryRange;
  countries: CountryTrafficRow[];
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
  rangeInput?: string | null
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
      country_name:
        row.country_name?.trim() || countryNameFromCode(code),
      flag: countryFlagEmoji(code),
      visits: Number(row.visits ?? 0),
      unique_visitors: Number(row.unique_visitors ?? 0),
      registered_users: Number(row.registered_users ?? 0),
      guests: Number(row.guests ?? 0),
      percentage: Number(row.percentage ?? 0),
    };
  });

  return {
    total_visits: Number(raw.total_visits ?? 0),
    unique_visitors: Number(raw.unique_visitors ?? 0),
    countries_count: Number(raw.countries_count ?? countries.length),
    range: parseRange(raw.range ?? range),
    countries,
  };
}
