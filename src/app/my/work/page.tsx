"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { OrderHistoryPanel } from "@/components/orders/OrderHistoryPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { canActAsProvider } from "@/lib/auth/roles";
import { useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";

export default function MyWorkHistoryPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, ready, displayProfile } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login?redirect=/my/work");
      return;
    }
    if (!canActAsProvider(displayProfile?.role)) {
      router.replace("/profile");
    }
  }, [ready, user, displayProfile?.role, router]);

  if (!ready || !user) return null;

  return (
    <AppLayout hideNav title={t("orderHistory.providerTitle")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("orderHistory.providerTitle")}
          subtitle={t("orderHistory.providerSubtitle")}
          backHref="/profile"
        />
        <Suspense fallback={<p className="text-sm text-text-muted">{t("common.loading")}</p>}>
          <OrderHistoryPanel
            viewer="provider"
            apiPath="/api/orders/history"
          />
        </Suspense>
      </div>
    </AppLayout>
  );
}
