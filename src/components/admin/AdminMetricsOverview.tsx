"use client";

import { AdminMetricCards, type MetricCardItem } from "@/components/admin/AdminMetricCards";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import type { AdminUserStats } from "@/lib/admin/user-stats";
import { useCancellableAdminLoad } from "@/hooks/useCancellableAdminLoad";
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

const ONLINE_POLL_MS = 30_000;

async function fetchPlatformStats(signal: AbortSignal): Promise<AdminUserStats> {
  const res = await authFetch("/api/admin/stats", { signal, cache: "no-store" });
  const data = (await res.json()) as { stats?: AdminUserStats; error?: string };
  if (!res.ok || !data.stats) {
    const message = data.error || "Failed to load platform statistics";
    console.error("[AdminMetricsOverview]", message);
    throw new Error(message);
  }
  return data.stats;
}

/** Same 8 home-grid metrics, same /api/admin/stats source of truth. */
export function AdminMetricsOverview() {
  const { t } = useTranslation();
  const { state, data: stats, refreshing, reload } = useCancellableAdminLoad<AdminUserStats>({
    load: fetchPlatformStats,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      void reload();
    }, ONLINE_POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const items: MetricCardItem[] = [
    {
      key: "customersOnline",
      label: t("admin.overview.customersOnline"),
      value: stats ? stats.customersOnline : null,
      href: "/admin/customers?onlineOnly=1",
    },
    {
      key: "providersOnline",
      label: t("admin.overview.providersOnline"),
      value: stats ? stats.providersOnline : null,
      href: "/admin/providers?onlineOnly=1",
    },
    {
      key: "registeredUsers",
      label: t("admin.overview.registeredUsers"),
      value: stats ? stats.registeredUsers : null,
      href: "/admin/customers",
    },
    {
      key: "totalVisits",
      label: t("admin.overview.totalVisits"),
      value: stats ? stats.totalVisits : null,
      href: "/admin/stats",
    },
    {
      key: "registeredCustomers",
      label: t("admin.overview.registeredCustomers"),
      value: stats ? stats.registeredCustomers : null,
      href: "/admin/customers",
    },
    {
      key: "registeredProviders",
      label: t("admin.overview.registeredProviders"),
      value: stats ? stats.registeredProviders : null,
      href: "/admin/providers",
    },
    {
      key: "totalOrders",
      label: t("admin.overview.totalOrders"),
      value: stats ? stats.totalOrders : null,
      href: "/admin/orders",
    },
    {
      key: "completedOrders",
      label: t("admin.overview.completedOrders"),
      value: stats ? stats.completedOrders : null,
      href: "/admin/orders?tab=completed",
    },
  ];

  return (
    <div className="space-y-4" data-testid="admin-metrics-overview">
      <div className="flex justify-end">
        <Button
          variant="secondary"
          className="w-full gap-2 sm:w-auto"
          loading={refreshing && state !== "loading"}
          onClick={() => void reload()}
        >
          <RefreshCw className="h-4 w-4" />
          {t("admin.refresh")}
        </Button>
      </div>
      <AdminMetricCards items={items} state={state} onRetry={() => void reload()} />
    </div>
  );
}
