"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { AdminUserStatsSection } from "@/components/admin/AdminUserStatsSection";
import { AdminRoleAnalyticsSection } from "@/components/admin/AdminRoleAnalyticsSection";
import { AdminOrderAnalyticsSection } from "@/components/admin/AdminOrderAnalyticsSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { isDemoMode } from "@/lib/config";
import type { PlatformStats } from "@/lib/analytics/platform-stats";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

export default function AdminStatsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isPlatformAdmin, ready, profileReady } = useAuth();
  const demo = isDemoMode();
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
    if (!ready || !profileReady) return;
    if (!isPlatformAdmin && !demo) {
      router.replace("/profile");
      return;
    }
    void load();
  }, [ready, profileReady, isPlatformAdmin, demo, router, load]);

  if (!ready || !profileReady) return null;
  if (!isPlatformAdmin && !demo) return null;

  const items = stats
    ? [
        { label: t("admin.pageViews"), value: stats.pageViews },
        { label: t("admin.uniqueVisitors"), value: stats.uniqueVisitors },
        { label: t("admin.registrations"), value: stats.registrations },
        { label: t("admin.ordersCreated"), value: stats.ordersCreated },
        { label: t("admin.offersCreated"), value: stats.offersCreated },
        { label: t("admin.ordersCompleted"), value: stats.ordersCompleted },
      ]
    : [
        { label: t("admin.pageViews"), value: null as number | null },
        { label: t("admin.uniqueVisitors"), value: null },
        { label: t("admin.registrations"), value: null },
        { label: t("admin.ordersCreated"), value: null },
        { label: t("admin.offersCreated"), value: null },
        { label: t("admin.ordersCompleted"), value: null },
      ];

  return (
    <AppLayout hideNav title={t("admin.statsTitle")}>
      <div className="space-y-8 p-4 pb-10">
        <PageHeader
          title={t("admin.statsTitle")}
          subtitle={t("admin.statsSubtitle")}
          backHref="/profile"
        />
        <AdminSectionNav activeHref="/admin/stats" />

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-text-primary">
            {t("admin.sections.overview")}
          </h2>
          <AdminUserStatsSection />
        </section>

        <section>
          <AdminRoleAnalyticsSection kind="customers" />
        </section>

        <section>
          <AdminRoleAnalyticsSection kind="providers" />
        </section>

        <section>
          <AdminOrderAnalyticsSection />
        </section>

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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <Card key={item.label} padding="md" className="min-h-[112px]">
                <p className="text-sm text-text-secondary">{item.label}</p>
                {loading && item.value == null && (
                  <p className="mt-3 text-sm text-text-secondary">{t("common.loading")}</p>
                )}
                {activityFailed && item.value == null && !loading && (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm text-danger">{t("admin.userStats.loadError")}</p>
                    <Button variant="secondary" className="gap-2" onClick={load}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      {t("admin.userStats.retry")}
                    </Button>
                  </div>
                )}
                {item.value != null && (
                  <p className="mt-1 text-2xl font-bold tabular-nums text-text-primary">
                    {item.value.toLocaleString()}
                  </p>
                )}
              </Card>
            ))}
          </div>
          {error && !activityFailed && <p className="text-sm text-danger">{error}</p>}
        </div>
      </div>
    </AppLayout>
  );
}
