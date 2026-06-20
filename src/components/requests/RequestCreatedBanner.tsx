"use client";

import { Card } from "@/components/ui/Card";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useSearchParams } from "next/navigation";

export function RequestCreatedBanner() {
  const searchParams = useSearchParams();
  if (searchParams.get("created") !== "1") return null;

  return (
    <Card padding="md" className="border-green-200 bg-green-50">
      <div className="flex gap-3">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
        <div className="space-y-1 text-sm text-green-900">
          <p className="font-semibold">Заказ опубликован</p>
          <p>
            Статус: <strong>open</strong>. Исполнители увидят его в поиске и смогут отправить
            предложения.
          </p>
          <Link href="/my/requests" className="font-semibold text-green-800 underline">
            Все мои заказы
          </Link>
        </div>
      </div>
    </Card>
  );
}
