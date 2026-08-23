"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { PlatformBalancePanel } from "@/components/finance/PlatformBalancePanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useRequirePlatformAdmin } from "@/hooks/useRequirePlatformAdmin";
import Link from "next/link";

export default function PlatformBalancePage() {
  const { t } = useTranslation();
  const { pending, allowed } = useRequirePlatformAdmin();

  if (pending || !allowed) return null;

  return (
    <AppLayout hideNav title="LOOK Platform">
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("admin.platformTitle")}
          subtitle={t("admin.platformSubtitle")}
          historyBack
        />
        <AdminSectionNav activeHref="/admin/platform" />
        <PlatformBalancePanel />
        <Link href="/finance/transactions?scope=admin">
          <Button variant="outline" className="w-full">
            {t("finance.transactions.title")}
          </Button>
        </Link>
      </div>
    </AppLayout>
  );
}
