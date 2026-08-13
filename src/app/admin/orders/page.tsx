"use client";

import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { AppLayout } from "@/components/layout/AppLayout";
import { OrderHistoryPanel } from "@/components/orders/OrderHistoryPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useRequirePlatformAdmin } from "@/hooks/useRequirePlatformAdmin";

export default function AdminOrdersPage() {
  const { t } = useTranslation();
  const { pending, allowed } = useRequirePlatformAdmin();

  if (pending || !allowed) return null;

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
