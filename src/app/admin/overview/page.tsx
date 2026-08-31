"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { AdminMetricsOverview } from "@/components/admin/AdminMetricsOverview";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useRequirePlatformAdmin } from "@/hooks/useRequirePlatformAdmin";

/**
 * Admin home “Все категории” destination — the 8 home metric tiles only.
 * Counters come from /api/admin/stats (same source as the home grid).
 */
export default function AdminOverviewPage() {
  const { t } = useTranslation();
  const { pending, allowed } = useRequirePlatformAdmin();

  if (pending || !allowed) return null;

  return (
    <AppLayout hideNav title={t("admin.overview.title")}>
      <div className="space-y-6 p-4 pb-10">
        <PageHeader
          title={t("admin.overview.title")}
          subtitle={t("admin.overview.subtitle")}
          historyBack
          historyBackHref="/"
        />
        <AdminMetricsOverview />
      </div>
    </AppLayout>
  );
}
