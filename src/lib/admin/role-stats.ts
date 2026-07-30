import type { SupabaseClient } from "@supabase/supabase-js";
export type RolePeriodStats = {
  registeredTotal: number;
  online: number;
  uniqueActiveToday: number;
  uniqueActive7d: number;
  uniqueActive30d: number;
  sessionsToday: number;
  sessions7d: number;
  sessions30d: number;
  newToday: number;
  new7d: number;
  new30d: number;
};

export type CustomerOrderStats = {
  total: number;
  today: number;
  d7: number;
  d30: number;
  customersWithOrders: number;
  customersWithoutOrders: number;
  avgOrdersPerActiveCustomer: number;
  open: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  withoutOffers: number;
  withOffers: number;
  avgHoursToFirstOffer: number | null;
  avgHoursToProviderSelected: number | null;
  withProviderSelected: number;
  customerConfirmedCompletions: number;
};

export type AdminCustomerStats = RolePeriodStats & {
  orders: CustomerOrderStats;
};

export type AdminProviderStats = RolePeriodStats;

function mapRolePeriod(raw: Record<string, unknown> | null): RolePeriodStats {
  return {
    registeredTotal: Number(raw?.registered_total ?? 0),
    online: Number(raw?.online ?? 0),
    uniqueActiveToday: Number(raw?.unique_active_today ?? 0),
    uniqueActive7d: Number(raw?.unique_active_7d ?? 0),
    uniqueActive30d: Number(raw?.unique_active_30d ?? 0),
    sessionsToday: Number(raw?.sessions_today ?? 0),
    sessions7d: Number(raw?.sessions_7d ?? 0),
    sessions30d: Number(raw?.sessions_30d ?? 0),
    newToday: Number(raw?.new_today ?? 0),
    new7d: Number(raw?.new_7d ?? 0),
    new30d: Number(raw?.new_30d ?? 0),
  };
}

function mapOrderStats(raw: Record<string, unknown> | null): CustomerOrderStats {
  const avgFirst = raw?.avg_hours_to_first_offer;
  const avgAccept = raw?.avg_hours_to_provider_selected;
  return {
    total: Number(raw?.total ?? 0),
    today: Number(raw?.today ?? 0),
    d7: Number(raw?.d7 ?? 0),
    d30: Number(raw?.d30 ?? 0),
    customersWithOrders: Number(raw?.customers_with_orders ?? 0),
    customersWithoutOrders: Number(raw?.customers_without_orders ?? 0),
    avgOrdersPerActiveCustomer: Number(raw?.avg_orders_per_active_customer ?? 0),
    open: Number(raw?.open ?? 0),
    inProgress: Number(raw?.in_progress ?? 0),
    completed: Number(raw?.completed ?? 0),
    cancelled: Number(raw?.cancelled ?? 0),
    withoutOffers: Number(raw?.without_offers ?? 0),
    withOffers: Number(raw?.with_offers ?? 0),
    avgHoursToFirstOffer: avgFirst == null ? null : Number(avgFirst),
    avgHoursToProviderSelected: avgAccept == null ? null : Number(avgAccept),
    withProviderSelected: Number(raw?.with_provider_selected ?? 0),
    customerConfirmedCompletions: Number(raw?.customer_confirmed_completions ?? 0),
  };
}

export async function fetchAdminCustomerStats(
  supabase: SupabaseClient
): Promise<AdminCustomerStats> {
  const { data, error } = await supabase.rpc("get_admin_customer_stats");
  if (error) throw new Error(error.message);
  const raw = (
    Array.isArray(data) ? data[0] : (data ?? {})
  ) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid customer stats payload");
  }
  const ordersRaw =
    raw.orders && typeof raw.orders === "object"
      ? (raw.orders as Record<string, unknown>)
      : null;
  return {
    ...mapRolePeriod(raw),
    orders: mapOrderStats(ordersRaw),
  };
}

export async function fetchAdminProviderStats(
  supabase: SupabaseClient
): Promise<AdminProviderStats> {
  const { data, error } = await supabase.rpc("get_admin_provider_stats");
  if (error) throw new Error(error.message);
  const raw = (
    Array.isArray(data) ? data[0] : (data ?? {})
  ) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid provider stats payload");
  }
  return mapRolePeriod(raw);
}
