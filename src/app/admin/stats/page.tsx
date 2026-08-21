"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { isDemoMode } from "@/lib/config";
import type { PlatformStats } from "@/lib/analytics/platform-stats";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";

export default function AdminStatsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isPlatformAdmin, ready, profileReady } = useAuth();
  const demo = isDemoMode();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/analytics/stats");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("common.error"));
        return;
      }
      setStats(data.stats);
    } catch {
      setError(t("common.error"));
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
    : [];

  return (
    <AppLayout hideNav title={t("admin.statsTitle")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("admin.statsTitle")}
          subtitle={t("admin.statsSubtitle")}
          backHref="/profile"
        />

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1 gap-2" loading={loading} onClick={load}>
            <RefreshCw className="h-4 w-4" />
            {t("admin.refresh")}
          </Button>
          <Link href="/admin/support" className="flex-1">
            <Button variant="outline" className="w-full">
              {t("admin.supportTitle")}
            </Button>
          </Link>
          <Link href="/admin/platform" className="flex-1">
            <Button variant="outline" className="w-full gap-2">
              <BarChart3 className="h-4 w-4" />
              {t("admin.platformBalance")}
            </Button>
          </Link>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <Card key={item.label} padding="md">
              <p className="text-sm text-text-secondary">{item.label}</p>
              <p className="mt-1 text-2xl font-bold text-text-primary">
                {item.value.toLocaleString()}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
