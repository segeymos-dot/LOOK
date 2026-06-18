"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { ProviderBalancePanel } from "@/components/finance/ProviderBalancePanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { canActAsProvider } from "@/lib/auth/roles";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function ProviderBalancePage() {
  const router = useRouter();
  const { displayProfile, ready, isProvider } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!isProvider && !canActAsProvider(displayProfile?.role)) {
      router.replace("/profile");
    }
  }, [ready, isProvider, displayProfile?.role, router]);

  return (
    <AppLayout activePath="/my/balance" title="Баланс">
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title="Баланс исполнителя"
          subtitle="Доступные средства и история начислений (тестовый режим)"
          backHref="/profile"
        />
        <ProviderBalancePanel />
        <Link href="/finance/transactions">
          <Button variant="outline" className="w-full">
            История операций
          </Button>
        </Link>
      </div>
    </AppLayout>
  );
}
