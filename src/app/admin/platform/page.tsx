"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { PlatformBalancePanel } from "@/components/finance/PlatformBalancePanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { isDemoMode } from "@/lib/config";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function PlatformBalancePage() {
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
    <AppLayout hideNav title="LOOK Platform">
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title="Баланс платформы"
          subtitle="Доход LOOK, комиссии и оборот (тестовый режим)"
          backHref="/profile"
        />
        <PlatformBalancePanel />
        <Link href="/finance/transactions">
          <Button variant="outline" className="w-full">
            История операций
          </Button>
        </Link>
      </div>
    </AppLayout>
  );
}
