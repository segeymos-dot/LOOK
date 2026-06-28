"use client";

import { OfferCard } from "@/components/offers/OfferCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslation } from "@/components/providers/LocaleProvider";
import type { Offer, RequestStatus } from "@/types";
import { cn } from "@/lib/utils";
import { Archive, Briefcase } from "lucide-react";
import { useMemo, useState } from "react";

const ACTIVE_REQUEST_STATUSES: RequestStatus[] = ["in_progress", "pending_review", "open"];
const HISTORY_REQUEST_STATUSES: RequestStatus[] = ["completed", "cancelled"];

interface OfferListTabsProps {
  offers: Offer[];
}

export function OfferListTabs({ offers }: OfferListTabsProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"active" | "history">("active");

  const active = useMemo(
    () =>
      offers.filter((o) => {
        const status = o.request?.status as RequestStatus | undefined;
        return !status || ACTIVE_REQUEST_STATUSES.includes(status);
      }),
    [offers]
  );
  const history = useMemo(
    () =>
      offers.filter((o) => {
        const status = o.request?.status as RequestStatus | undefined;
        return status && HISTORY_REQUEST_STATUSES.includes(status);
      }),
    [offers]
  );

  const list = tab === "active" ? active : history;

  return (
    <div className="space-y-4">
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
          <Briefcase className="h-4 w-4" />
          {t("offer.tabs.inWork")} ({active.length})
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
          {t("offer.tabs.history")} ({history.length})
        </button>
      </div>

      {list.length > 0 ? (
        <div className="space-y-3">
          {list.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              requestStatus={offer.request?.status}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={tab === "active" ? Briefcase : Archive}
          title={tab === "active" ? t("offer.tabs.emptyActiveTitle") : t("offer.tabs.emptyHistoryTitle")}
          description={
            tab === "active" ? t("offer.tabs.emptyActiveDesc") : t("offer.tabs.emptyHistoryDesc")
          }
        />
      )}
    </div>
  );
}
