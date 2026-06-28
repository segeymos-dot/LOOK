import type { SupabaseClient } from "@supabase/supabase-js";

export type PlatformStats = {
  pageViews: number;
  uniqueVisitors: number;
  registrations: number;
  ordersCreated: number;
  offersCreated: number;
  ordersCompleted: number;
};

const PAGE_VIEWS_KEY = "analytics_page_views";
const UNIQUE_VISITORS_KEY = "analytics_unique_visitors";
const VISITOR_KEY_PREFIX = "analytics_visitor:";

async function readSettingsCounter(
  supabase: SupabaseClient,
  key: string
): Promise<number> {
  const { data } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return Number(data?.value ?? 0);
}

async function countSettingsVisitors(supabase: SupabaseClient): Promise<number | null> {
  const { count, error } = await supabase
    .from("platform_settings")
    .select("key", { count: "exact", head: true })
    .like("key", `${VISITOR_KEY_PREFIX}%`);

  if (error) return null;
  return count ?? 0;
}

export async function fetchPlatformStats(
  supabase: SupabaseClient
): Promise<PlatformStats> {
  const [profilesRes, requestsRes, offersRes, completedRes, analyticsRes, visitorsRes, settingsPageViews, settingsUnique, settingsVisitorCount] =
    await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("requests").select("id", { count: "exact", head: true }),
      supabase.from("offers").select("id", { count: "exact", head: true }),
      supabase
        .from("requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed"),
      supabase
        .from("platform_analytics")
        .select("page_views, unique_visitors")
        .eq("id", "global")
        .maybeSingle(),
      supabase
        .from("platform_visitor_sessions")
        .select("visitor_key", { count: "exact", head: true }),
      readSettingsCounter(supabase, PAGE_VIEWS_KEY),
      readSettingsCounter(supabase, UNIQUE_VISITORS_KEY),
      countSettingsVisitors(supabase),
    ]);

  const analytics = analyticsRes.error ? null : analyticsRes.data;
  const uniqueFromSessions = visitorsRes.error ? null : visitorsRes.count;
  const pageViewsFromSettings = settingsPageViews;
  const uniqueFromSettings =
    settingsVisitorCount ?? settingsUnique ?? 0;

  return {
    pageViews: Number(
      analytics?.page_views ?? pageViewsFromSettings ?? 0
    ),
    uniqueVisitors: Number(
      analytics?.unique_visitors ?? uniqueFromSessions ?? uniqueFromSettings ?? 0
    ),
    registrations: profilesRes.count ?? 0,
    ordersCreated: requestsRes.count ?? 0,
    offersCreated: offersRes.count ?? 0,
    ordersCompleted: completedRes.count ?? 0,
  };
}

export async function recordSiteVisit(
  admin: SupabaseClient,
  visitorKey: string
): Promise<boolean> {
  const { error } = await admin.rpc("record_site_visit", {
    p_visitor_key: visitorKey,
  });

  if (!error) return true;

  if (
    !error.message.includes("Could not find the function") &&
    !error.message.includes("PGRST202") &&
    !error.message.includes("does not exist")
  ) {
    const tableFallback = await recordSiteVisitTableFallback(admin, visitorKey);
    if (tableFallback) return true;
    return recordSiteVisitSettingsFallback(admin, visitorKey);
  }

  const tableFallback = await recordSiteVisitTableFallback(admin, visitorKey);
  if (tableFallback) return true;
  return recordSiteVisitSettingsFallback(admin, visitorKey);
}

async function recordSiteVisitTableFallback(
  admin: SupabaseClient,
  visitorKey: string
): Promise<boolean> {
  const { error: tableError } = await admin
    .from("platform_analytics")
    .select("id")
    .eq("id", "global")
    .maybeSingle();

  if (tableError?.message?.includes("does not exist")) return false;

  const { data: existing } = await admin
    .from("platform_visitor_sessions")
    .select("visitor_key")
    .eq("visitor_key", visitorKey)
    .maybeSingle();

  const isNew = !existing;

  const { data: row } = await admin
    .from("platform_analytics")
    .select("page_views, unique_visitors")
    .eq("id", "global")
    .single();

  if (!row) {
    await admin.from("platform_analytics").insert({
      id: "global",
      page_views: 1,
      unique_visitors: isNew ? 1 : 0,
    });
  } else {
    await admin
      .from("platform_analytics")
      .update({
        page_views: Number(row.page_views) + 1,
        unique_visitors: Number(row.unique_visitors) + (isNew ? 1 : 0),
        updated_at: new Date().toISOString(),
      })
      .eq("id", "global");
  }

  if (isNew) {
    await admin.from("platform_visitor_sessions").insert({ visitor_key: visitorKey });
  } else {
    await admin
      .from("platform_visitor_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("visitor_key", visitorKey);
  }

  return true;
}

async function recordSiteVisitSettingsFallback(
  admin: SupabaseClient,
  visitorKey: string
): Promise<boolean> {
  const visitorSettingKey = `${VISITOR_KEY_PREFIX}${visitorKey}`;

  const { data: existingVisitor } = await admin
    .from("platform_settings")
    .select("key")
    .eq("key", visitorSettingKey)
    .maybeSingle();

  const isNew = !existingVisitor;
  const now = new Date().toISOString();

  const pageViews = await readSettingsCounter(admin, PAGE_VIEWS_KEY);
  const uniqueVisitors = await readSettingsCounter(admin, UNIQUE_VISITORS_KEY);

  const upserts = [
    {
      key: PAGE_VIEWS_KEY,
      value: String(pageViews + 1),
      updated_at: now,
    },
    {
      key: visitorSettingKey,
      value: now,
      updated_at: now,
    },
  ];

  if (isNew) {
    upserts.push({
      key: UNIQUE_VISITORS_KEY,
      value: String(uniqueVisitors + 1),
      updated_at: now,
    });
  }

  const { error } = await admin
    .from("platform_settings")
    .upsert(upserts, { onConflict: "key" });

  return !error;
}
