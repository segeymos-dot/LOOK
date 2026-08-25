"use client";

import { AdminMetricCards, type MetricCardItem } from "@/components/admin/AdminMetricCards";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import type { AdminUserStats } from "@/lib/admin/user-stats";
import { useCancellableAdminLoad } from "@/hooks/useCancellableAdminLoad";
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

type MetricDef = {
  key: string;
  value: (s: AdminUserStats) => number;
  href?: string;
  labelKey: string;
  hintKey?: string;
};

const ONLINE_POLL_MS = 30_000;

async function fetchPlatformStats(signal: AbortSignal): Promise<AdminUserStats> {
  const res = await authFetch("/api/admin/stats", { signal, cache: "no-store" });
  const data = (await res.json()) as { stats?: AdminUserStats; error?: string };
  if (!res.ok || !data.stats) {
    const message = data.error || "Failed to load user statistics";
    console.error("[AdminUserStatsSection]", message);
    throw new Error(message);
  }
  return data.stats;
}

export function AdminUserStatsSection() {
  const { t } = useTranslation();
  const { state, data: stats, refreshing, reload } = useCancellableAdminLoad<AdminUserStats>({
    load: fetchPlatformStats,
  });

  useEffect(() => {
    const onlineTimer = setInterval(() => {
      void reload();
    }, ONLINE_POLL_MS);
    return () => clearInterval(onlineTimer);
  }, [reload]);

  const groups: { title: string; metrics: MetricDef[] }[] = [
    {
      title: t("admin.userStats.groupUsers"),
      metrics: [
        {
          key: "registeredUsers",
          labelKey: "admin.userStats.registeredUsers",
          hintKey: "admin.userStats.registeredUsersHint",
          value: (s) => s.registeredUsers,
        },
        {
          key: "registeredCustomers",
          labelKey: "admin.userStats.registeredCustomers",
          hintKey: "admin.userStats.registeredCustomersHint",
          href: "/admin/customers",
          value: (s) => s.registeredCustomers,
        },
        {
          key: "registeredProviders",
          labelKey: "admin.userStats.registeredProviders",
          hintKey: "admin.userStats.registeredProvidersHint",
          href: "/admin/providers",
          value: (s) => s.registeredProviders,
        },
        {
          key: "customersOnline",
          labelKey: "admin.userStats.customersOnline",
          hintKey: "admin.userStats.customersOnlineHint",
          href: "/admin/customers?onlineOnly=1",
          value: (s) => s.customersOnline,
        },
        {
          key: "providersOnline",
          labelKey: "admin.userStats.providersOnline",
          hintKey: "admin.userStats.providersOnlineHint",
          href: "/admin/providers?onlineOnly=1",
          value: (s) => s.providersOnline,
        },
      ],
    },
    {
      title: t("admin.userStats.groupOrders"),
      metrics: [
        {
          key: "totalOrders",
          labelKey: "admin.userStats.totalOrders",
          hintKey: "admin.userStats.totalOrdersHint",
          href: "/admin/orders?tab=all",
          value: (s) => s.totalOrders,
        },
        {
          key: "completedOrders",
          labelKey: "admin.userStats.completedOrders",
          hintKey: "admin.userStats.completedOrdersHint",
          href: "/admin/orders?tab=completed",
          value: (s) => s.completedOrders,
        },
        {
          key: "activeOrders",
          labelKey: "admin.userStats.activeOrders",
          hintKey: "admin.userStats.activeOrdersHint",
          href: "/admin/orders?tab=all",
          value: (s) => s.activeOrders,
        },
      ],
    },
    {
      title: t("admin.userStats.groupVisits"),
      metrics: [
        {
          key: "totalVisits",
          labelKey: "admin.userStats.totalVisits",
          hintKey: "admin.userStats.totalVisitsHint",
          value: (s) => s.totalVisits,
        },
        {
          key: "uniqueVisitors",
          labelKey: "admin.userStats.uniqueVisitors",
          hintKey: "admin.userStats.uniqueVisitorsHint",
          value: (s) => s.uniqueVisitors,
        },
        {
          key: "visitsToday",
          labelKey: "admin.userStats.visitsToday",
          hintKey: "admin.userStats.visitsTodayHint",
          value: (s) => s.visitsToday,
        },
      ],
    },
    {
      title: t("admin.userStats.groupAdmin"),
      metrics: [
        {
          key: "adminSessionsTotal",
          labelKey: "admin.userStats.adminSessionsTotal",
          hintKey: "admin.userStats.adminSessionsTotalHint",
          value: (s) => s.adminVisitsTotal,
        },
        {
          key: "adminSessionsToday",
          labelKey: "admin.userStats.adminSessionsToday",
          hintKey: "admin.userStats.adminSessionsTodayHint",
          value: (s) => s.adminVisitsToday,
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary">
            {t("admin.userStats.title")}
          </h2>
          <p className="text-sm text-text-secondary">{t("admin.userStats.subtitle")}</p>
        </div>
        <Button
          variant="secondary"
          className="w-full shrink-0 gap-2 sm:w-auto"
          loading={refreshing && state !== "loading"}
          onClick={() => void reload()}
        >
          <RefreshCw className="h-4 w-4" />
          {t("admin.refresh")}
        </Button>
      </div>

      {groups.map((group) => {
        const items: MetricCardItem[] = group.metrics.map((metric) => ({
          key: metric.key,
          label: t(metric.labelKey),
          hint: metric.hintKey ? t(metric.hintKey) : undefined,
          value: stats ? metric.value(stats) : null,
          href: metric.href,
        }));

        return (
          <section key={group.title} className="space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">{group.title}</h3>
            <AdminMetricCards items={items} state={state} onRetry={() => void reload()} />
          </section>
        );
      })}
    </div>
  );
}
