"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { RefreshCw } from "lucide-react";

export type MetricCardItem = {
  key: string;
  label: string;
  hint?: string;
  value: number | string | null;
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
      {items.map((item) => (
        <Card key={item.key} padding="md" className="min-h-[120px]">
          <p className="text-sm text-text-secondary">{item.label}</p>
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
        </Card>
      ))}
    </div>
  );
}
