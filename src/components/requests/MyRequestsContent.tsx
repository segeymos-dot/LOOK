"use client";

import { RequestListTabs } from "@/components/requests/RequestListTabs";
import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import type { Request } from "@/types";
import Link from "next/link";
import { ClipboardList } from "lucide-react";

interface MyRequestsContentProps {
  requests: Request[];
  showCreateButton?: boolean;
}

export function MyRequestsContent({ requests, showCreateButton = true }: MyRequestsContentProps) {
  const { t } = useTranslation();

  return (
    <AppLayout activePath="/profile" title={t("request.myRequests")}>
      <div className="space-y-5 p-4">
        <PageHeader
          title={t("request.myRequests")}
          subtitle={t("request.myRequestsSub")}
          backHref="/profile"
        />

        {showCreateButton && (
          <Link href="/requests/new">
            <Button className="w-full gap-2" size="sm">
              {t("request.createOrder")}
            </Button>
          </Link>
        )}

        {requests.length > 0 ? (
          <RequestListTabs requests={requests} />
        ) : (
          <EmptyState
            icon={ClipboardList}
            title={t("request.emptyTitle")}
            description={t("request.emptyDesc")}
            action={
              <Link href="/requests/new">
                <Button>{t("request.createRequest")}</Button>
              </Link>
            }
          />
        )}
      </div>
    </AppLayout>
  );
}
