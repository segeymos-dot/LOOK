"use client";

import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { AppLayout } from "@/components/layout/AppLayout";
import { OrderHistoryPanel } from "@/components/orders/OrderHistoryPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { isDemoMode } from "@/lib/config";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AdminOrdersPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPlatformAdmin, ready, profileReady } = useAuth();
  const demo = isDemoMode();

  useEffect(() => {
    if (!ready || !profileReady) return;
    if (!isPlatformAdmin && !demo) {
      router.replace("/profile");
    }
  }, [ready, profileReady, isPlatformAdmin, demo, router]);

  if (!ready || !profileReady) return null;
  if (!isPlatformAdmin && !demo) return null;

  return (
    <AppLayout hideNav title={t("orderHistory.adminTitle")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("orderHistory.adminTitle")}
          subtitle={t("orderHistory.adminSubtitle")}
          backHref="/profile"
        />
        <AdminSectionNav activeHref="/admin/orders" />
        <OrderHistoryPanel
          viewer="admin"
          apiPath="/api/admin/orders"
          showAdminFilters
          allowExport
        />
      </div>
    </AppLayout>
  );
}
