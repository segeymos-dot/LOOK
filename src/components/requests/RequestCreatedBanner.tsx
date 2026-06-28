"use client";

import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useSearchParams } from "next/navigation";

export function RequestCreatedBanner() {
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  if (searchParams.get("created") !== "1") return null;

  return (
    <Card padding="md" className="border-green-200 bg-green-50">
      <div className="flex gap-3">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
        <div className="space-y-1 text-sm text-green-900">
          <p className="font-semibold">{t("request.createdTitle")}</p>
          <p>{t("request.createdBody")}</p>
          <Link href="/my/requests" className="font-semibold text-green-800 underline">
            {t("request.createdMyOrders")}
          </Link>
        </div>
      </div>
    </Card>
  );
}
