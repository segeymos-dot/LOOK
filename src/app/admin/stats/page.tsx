"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { AdminUserStatsSection } from "@/components/admin/AdminUserStatsSection";
import { AdminCustomerStatsProvider } from "@/components/admin/AdminCustomerStatsProvider";
import { AdminRoleAnalyticsSection } from "@/components/admin/AdminRoleAnalyticsSection";
import { AdminOrderAnalyticsSection } from "@/components/admin/AdminOrderAnalyticsSection";
import { AdminMetricCards, type MetricCardItem } from "@/components/admin/AdminMetricCards";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useRequirePlatformAdmin } from "@/hooks/useRequirePlatformAdmin";
import { authFetch } from "@/lib/auth/client-fetch";
import type { PlatformStats } from "@/lib/analytics/platform-stats";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

export default function AdminStatsPage() {
  const { t } = useTranslation();
  const { pending, allowed } = useRequirePlatformAdmin();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activityFailed, setActivityFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActivityFailed(false);
    try {
      const res = await authFetch("/api/analytics/stats");
      const data = await res.json();
      if (!res.ok) {
        setActivityFailed(true);
        setError(data.error ?? t("common.error"));
        setStats(null);
        return;
      }
      setStats(data.stats);
    } catch {
      setActivityFailed(true);
      setError(t("common.error"));
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (pending || !allowed) return;
    void load();
  }, [pending, allowed, load]);

  if (pending || !allowed) return null;

  const activityState = loading ? "loading" : activityFailed ? "error" : "ready";
  const activityItems: MetricCardItem[] = [
    {
      key: "pageViews",
      label: t("admin.pageViews"),
      value: stats?.pageViews ?? null,
    },
    {
      key: "uniqueVisitors",
      label: t("admin.uniqueVisitors"),
      value: stats?.uniqueVisitors ?? null,
    },
    {
      key: "registrations",
      label: t("admin.registrations"),
      value: stats?.registrations ?? null,
      href: "/admin/customers",
    },
    {
      key: "ordersCreated",
      label: t("admin.ordersCreated"),
      value: stats?.ordersCreated ?? null,
      href: "/admin/orders?tab=all",
    },
    {
      key: "offersCreated",
      label: t("admin.offersCreated"),
      value: stats?.offersCreated ?? null,
    },
    {
      key: "ordersCompleted",
      label: t("admin.ordersCompleted"),
      value: stats?.ordersCompleted ?? null,
      href: "/admin/orders?tab=completed",
    },
  ];

  return (
    <AppLayout hideNav title={t("admin.statsTitle")}>
      <div className="space-y-8 p-4 pb-10">
        <PageHeader
          title={t("admin.statsTitle")}
          subtitle={t("admin.statsSubtitle")}
          historyBack
          historyBackHref="/profile"
        />
        <AdminSectionNav activeHref="/admin/stats" />

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-text-primary">
            {t("admin.sections.overview")}
          </h2>
          <AdminUserStatsSection />
        </section>

        <AdminCustomerStatsProvider>
          <section>
            <AdminRoleAnalyticsSection kind="customers" />
          </section>

          <section>
            <AdminRoleAnalyticsSection kind="providers" />
          </section>

          <section>
            <AdminOrderAnalyticsSection />
          </section>
        </AdminCustomerStatsProvider>

        <div className="space-y-3 pt-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                {t("admin.activityTitle")}
              </h2>
              <p className="text-sm text-text-secondary">{t("admin.activitySubtitle")}</p>
            </div>
            <Button
              variant="secondary"
              className="w-full shrink-0 gap-2 sm:w-auto"
              loading={loading}
              onClick={load}
            >
              <RefreshCw className="h-4 w-4" />
              {t("admin.refresh")}
            </Button>
          </div>

          <AdminMetricCards
            items={activityItems}
            state={activityState}
            onRetry={() => void load()}
          />
          {error && !activityFailed && <p className="text-sm text-danger">{error}</p>}
        </div>
      </div>
    </AppLayout>
  );
}
