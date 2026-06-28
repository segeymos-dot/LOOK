"use client";

import { RequestCard } from "@/components/requests/RequestCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslation } from "@/components/providers/LocaleProvider";
import type { Request, RequestStatus } from "@/types";
import { cn } from "@/lib/utils";
import { Archive, Bell, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const ACTIVE_STATUSES: RequestStatus[] = ["open", "in_progress", "pending_review"];
const HISTORY_STATUSES: RequestStatus[] = ["completed", "cancelled"];

interface RequestListTabsProps {
  requests: Request[];
}

export function RequestListTabs({ requests }: RequestListTabsProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"active" | "history">("active");

  const active = useMemo(
    () => requests.filter((r) => ACTIVE_STATUSES.includes(r.status)),
    [requests]
  );
  const history = useMemo(
    () => requests.filter((r) => HISTORY_STATUSES.includes(r.status)),
    [requests]
  );
  const pendingReview = active.filter((r) => r.status === "pending_review");

  const list = tab === "active" ? active : history;

  return (
    <div className="space-y-4">
      {pendingReview.length > 0 && tab === "active" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <Bell className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">
                {pendingReview.length === 1
                  ? t("request.tabs.pendingReviewOne")
                  : t("request.tabs.pendingReviewMany", { count: pendingReview.length })}
              </p>
              <p className="mt-1 text-amber-800">{t("request.tabs.reviewHint")}</p>
              {pendingReview.length === 1 && (
                <Link
                  href={`/requests/${pendingReview[0].id}`}
                  className="mt-2 inline-block font-medium text-amber-900 underline"
                >
                  {t("request.tabs.goToOrder")}
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 rounded-2xl bg-surface-muted p-1">
        <button
          type="button"
          onClick={() => setTab("active")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
            tab === "active"
              ? "bg-surface text-text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          <ClipboardList className="h-4 w-4" />
          {t("request.tabs.active")} ({active.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
            tab === "history"
              ? "bg-surface text-text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          <Archive className="h-4 w-4" />
          {t("request.tabs.history")} ({history.length})
        </button>
      </div>

      {list.length > 0 ? (
        <div className="space-y-3">
          {list.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={tab === "active" ? ClipboardList : Archive}
          title={tab === "active" ? t("request.tabs.emptyActiveTitle") : t("request.tabs.emptyHistoryTitle")}
          description={
            tab === "active" ? t("request.tabs.emptyActiveDesc") : t("request.tabs.emptyHistoryDesc")
          }
        />
      )}
    </div>
  );
}
