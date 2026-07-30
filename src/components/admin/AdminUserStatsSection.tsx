"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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

const METRICS: { key: MetricKey; online: boolean }[] = [
  { key: "registeredCustomers", online: false },
  { key: "registeredProviders", online: false },
  { key: "usersOnline", online: true },
  { key: "customersOnline", online: true },
  { key: "providersOnline", online: true },
  { key: "uniqueVisitors", online: false },
  { key: "totalVisits", online: false },
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

  const loadState =
    state === "ready" && stats
      ? ({ status: "ready", stats } as const)
      : state === "error"
        ? ({ status: "error" } as const)
        : ({ status: "loading" } as const);

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {METRICS.map((metric) => (
          <StatCard
            key={metric.key}
            title={t(`admin.userStats.${metric.key}`)}
            hint={t(`admin.userStats.${metric.key}Hint`)}
            state={loadState}
            valueKey={metric.key}
            onRetry={() => void reload()}
          />
        ))}
      </div>
    </div>
  );
}

function StatCard({
  title,
  hint,
  state,
  valueKey,
  onRetry,
}: {
  title: string;
  hint: string;
  state:
    | { status: "loading" }
    | { status: "ready"; stats: AdminUserStats }
    | { status: "error" };
  valueKey: MetricKey;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Card padding="md" className="min-h-[132px]">
      <p className="text-sm text-text-secondary">{title}</p>

      {state.status === "loading" && (
        <p className="mt-3 text-sm text-text-secondary">{t("common.loading")}</p>
      )}

      {state.status === "error" && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-danger">{t("admin.userStats.loadError")}</p>
          <Button variant="secondary" className="gap-2" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t("admin.userStats.retry")}
          </Button>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <p className="mt-1 text-2xl font-bold tabular-nums text-text-primary">
            {state.stats[valueKey].toLocaleString()}
          </p>
          <p className="mt-2 text-xs text-text-secondary">{hint}</p>
        </>
      )}
    </Card>
  );
}
