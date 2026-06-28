"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { ProviderBalancePanel } from "@/components/finance/ProviderBalancePanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { canActAsProvider } from "@/lib/auth/roles";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function ProviderBalancePage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { displayProfile, ready, isProvider } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!isProvider && !canActAsProvider(displayProfile?.role)) {
      router.replace("/profile");
    }
  }, [ready, isProvider, displayProfile?.role, router]);

  return (
    <AppLayout activePath="/my/balance" title={t("finance.balance.providerTitle")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("finance.balance.providerTitle")}
          subtitle={t("finance.balance.providerSubtitle")}
          backHref="/profile"
        />
        <ProviderBalancePanel />
        <Link href="/finance/transactions">
          <Button variant="outline" className="w-full">
            {t("finance.transactions.title")}
          </Button>
        </Link>
      </div>
    </AppLayout>
  );
}
