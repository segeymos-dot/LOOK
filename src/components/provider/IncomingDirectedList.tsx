"use client";

import { IncomingDirectedCard } from "@/components/provider/IncomingDirectedCard";
import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import type { IncomingDirectedRequest } from "@/lib/data/incoming-directed-requests";
import Link from "next/link";
import { Inbox } from "lucide-react";

interface IncomingDirectedListProps {
  items: IncomingDirectedRequest[];
  pendingCount: number;
}

export function IncomingDirectedList({
  items,
  pendingCount,
}: IncomingDirectedListProps) {
  const { t } = useTranslation();

  return (
    <AppLayout activePath="/profile" title={t("incoming.title")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={
            pendingCount > 0
              ? `${t("incoming.title")} ${pendingCount}`
              : t("incoming.title")
          }
          subtitle={t("incoming.subtitle")}
          backHref="/profile"
        />

        {items.length > 0 ? (
          <div className="space-y-3">
            {items.map((item) => (
              <IncomingDirectedCard key={item.conversation_id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Inbox}
            title={t("incoming.emptyTitle")}
            description={t("incoming.emptyDesc")}
            action={
              <Link href="/search">
                <Button>{t("profile.findOrders")}</Button>
              </Link>
            }
          />
        )}
      </div>
    </AppLayout>
  );
}
