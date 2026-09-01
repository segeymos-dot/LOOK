import type { SupabaseClient } from "@supabase/supabase-js";
import {
  countryFlagEmoji,
  countryNameFromCode,
  normalizeCountryCode,
} from "@/lib/analytics/geo-country";
import { COUNTRY_ANALYTICS_CUTOVER_AT } from "@/lib/analytics/country-analytics-cutover";

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
  /** Debug-only traffic breakdown (not shown in UI by default). */
  human_visits: number;
  technical_visits: number;
  bot_visits: number;
  cutover_at: string;
  include_historical: boolean;
  /** Internal: all_since_cutover when range=all and historical excluded. */
  effective_since: string | null;
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
  locale: "en" | "ru" = "en",
  options?: { includeHistorical?: boolean }
): Promise<VisitorsByCountryStats> {
  const range = parseRange(rangeInput);
  const includeHistorical = Boolean(options?.includeHistorical);
  const { data, error } = await supabase.rpc("get_admin_visitors_by_country", {
    p_range: range,
    p_cutover_at: includeHistorical ? null : COUNTRY_ANALYTICS_CUTOVER_AT,
    p_include_historical: includeHistorical,
  });
  if (error) throw new Error(error.message);

  const raw = (data ?? {}) as {
    total_visits?: number;
    unique_visitors?: number;
    countries_count?: number;
    range?: string;
    human_visits?: number;
    technical_visits?: number;
    bot_visits?: number;
    cutover_at?: string | null;
    include_historical?: boolean;
    effective_since?: string | null;
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
    human_visits: Number(raw.human_visits ?? 0),
    technical_visits: Number(raw.technical_visits ?? 0),
    bot_visits: Number(raw.bot_visits ?? 0),
    cutover_at: String(raw.cutover_at ?? COUNTRY_ANALYTICS_CUTOVER_AT),
    include_historical: Boolean(raw.include_historical ?? includeHistorical),
    effective_since: raw.effective_since ?? (includeHistorical ? null : COUNTRY_ANALYTICS_CUTOVER_AT),
  };
}
