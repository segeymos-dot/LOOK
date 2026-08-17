"use client";

import { AdminMetricCards, type MetricCardItem } from "@/components/admin/AdminMetricCards";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import type { AdminUserStats } from "@/lib/admin/user-stats";
import { useCancellableAdminLoad } from "@/hooks/useCancellableAdminLoad";
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

type MetricKey =
  | "registeredCustomers"
  | "registeredProviders"
  | "usersOnline"
  | "customersOnline"
  | "providersOnline"
  | "uniqueVisitors"
  | "totalVisits";

const METRICS: { key: MetricKey; href?: string }[] = [
  { key: "registeredCustomers", href: "/admin/customers" },
  { key: "registeredProviders", href: "/admin/providers" },
  { key: "usersOnline" },
  { key: "customersOnline", href: "/admin/customers?onlineOnly=1" },
  { key: "providersOnline", href: "/admin/providers" },
  { key: "uniqueVisitors" },
  { key: "totalVisits" },
];

const ONLINE_POLL_MS = 30_000;

async function fetchUserStats(signal: AbortSignal): Promise<AdminUserStats> {
  const res = await authFetch("/api/admin/user-stats", { signal });
  const data = (await res.json()) as { stats?: AdminUserStats; error?: string };
  if (!res.ok || !data.stats) {
    throw new Error(data.error || "Failed to load user statistics");
  }
  return data.stats;
}

export function AdminUserStatsSection() {
  const { t } = useTranslation();
  const { state, data: stats, refreshing, reload } = useCancellableAdminLoad<AdminUserStats>({
    load: fetchUserStats,
  });

  useEffect(() => {
    const onlineTimer = setInterval(() => {
      void reload();
    }, ONLINE_POLL_MS);
    return () => clearInterval(onlineTimer);
  }, [reload]);

  const items: MetricCardItem[] = METRICS.map((metric) => ({
    key: metric.key,
    label: t(`admin.userStats.${metric.key}`),
    hint: t(`admin.userStats.${metric.key}Hint`),
    value: stats ? stats[metric.key] : null,
    href: metric.href,
  }));

  return (
    <div className="space-y-3">
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

      <AdminMetricCards items={items} state={state} onRetry={() => void reload()} />
    </div>
  );
}
