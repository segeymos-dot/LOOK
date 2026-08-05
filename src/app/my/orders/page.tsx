"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { OrderHistoryPanel } from "@/components/orders/OrderHistoryPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { canActAsCustomer } from "@/lib/auth/roles";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function MyOrdersHistoryPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, ready, displayProfile } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login?redirect=/my/orders");
      return;
    }
    if (!canActAsCustomer(displayProfile?.role)) {
      router.replace("/profile");
    }
  }, [ready, user, displayProfile?.role, router]);

  if (!ready || !user) return null;

  return (
    <AppLayout hideNav title={t("orderHistory.customerTitle")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("orderHistory.customerTitle")}
          subtitle={t("orderHistory.customerSubtitle")}
          backHref="/profile"
        />
        <OrderHistoryPanel
          viewer="customer"
          apiPath="/api/orders/history"
        />
      </div>
    </AppLayout>
  );
}
