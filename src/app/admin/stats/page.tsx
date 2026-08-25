"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { AdminUserStatsSection } from "@/components/admin/AdminUserStatsSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useRequirePlatformAdmin } from "@/hooks/useRequirePlatformAdmin";

/**
 * Single admin stats surface. All counters come from /api/admin/stats
 * (same source as home admin tiles).
 */
export default function AdminStatsPage() {
  const { t } = useTranslation();
  const { pending, allowed } = useRequirePlatformAdmin();

  if (pending || !allowed) return null;

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
        <AdminUserStatsSection />
      </div>
    </AppLayout>
  );
}
