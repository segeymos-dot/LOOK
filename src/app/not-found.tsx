"use client";

import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { UserRound } from "lucide-react";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <AppLayout hideNav title={t("common.look")}>
      <div className="p-4">
        <EmptyState
          icon={UserRound}
          title={t("notFound.title")}
          description={t("notFound.description")}
          action={
            <Link href="/">
              <Button>{t("notFound.home")}</Button>
            </Link>
          }
        />
      </div>
    </AppLayout>
  );
}
