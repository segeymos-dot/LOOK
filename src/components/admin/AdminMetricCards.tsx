"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { cn } from "@/lib/utils";
import { ChevronRight, RefreshCw } from "lucide-react";
import Link from "next/link";

export type MetricCardItem = {
  key: string;
  label: string;
  hint?: string;
  value: number | string | null;
  href?: string;
};

type LoadState = "loading" | "ready" | "error";

export function AdminMetricCards({
  items,
  state,
  onRetry,
}: {
  items: MetricCardItem[];
  state: LoadState;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const clickable = Boolean(item.href) && state === "ready";
        const ariaLabel = t("admin.metricDrillDown", { label: item.label });
        const body = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-text-secondary">{item.label}</p>
              {clickable ? (
                <ChevronRight
                  className="mt-0.5 h-5 w-5 shrink-0 text-text-muted"
                  aria-hidden
                />
              ) : null}
            </div>
            {state === "loading" && (
              <p className="mt-3 text-sm text-text-secondary">{t("common.loading")}</p>
            )}
            {state === "error" && (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-danger">{t("admin.userStats.loadError")}</p>
                <Button variant="secondary" className="gap-2" onClick={onRetry}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("admin.userStats.retry")}
                </Button>
              </div>
            )}
            {state === "ready" && (
              <>
                <p className="mt-1 break-all text-2xl font-bold tabular-nums text-text-primary">
                  {typeof item.value === "number"
                    ? item.value.toLocaleString()
                    : item.value ?? "—"}
                </p>
                {item.hint ? (
                  <p className="mt-2 text-xs text-text-secondary">{item.hint}</p>
                ) : null}
              </>
            )}
          </>
        );

        if (clickable && item.href) {
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-label={ariaLabel}
              className={cn(
                "block min-h-[44px] rounded-2xl outline-none",
                "focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              )}
            >
              <Card
                padding="md"
                className={cn(
                  "min-h-[120px] transition-colors",
                  "hover:bg-surface-muted active:bg-surface-muted",
                  "cursor-pointer"
                )}
              >
                {body}
              </Card>
            </Link>
          );
        }

        return (
          <Card key={item.key} padding="md" className="min-h-[120px]">
            {body}
          </Card>
        );
      })}
    </div>
  );
}
