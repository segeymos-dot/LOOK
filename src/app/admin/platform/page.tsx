"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { PlatformBalancePanel } from "@/components/finance/PlatformBalancePanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { isDemoMode } from "@/lib/config";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function PlatformBalancePage() {
  const router = useRouter();
  const { t } = useTranslation();
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
          title={t("admin.platformTitle")}
          subtitle={t("admin.platformSubtitle")}
          backHref="/profile"
        />
        <AdminSectionNav activeHref="/admin/platform" />
        <PlatformBalancePanel />
        <Link href="/finance/transactions">
          <Button variant="outline" className="w-full">
            {t("finance.transactions.title")}
          </Button>
        </Link>
      </div>
    </AppLayout>
  );
}
