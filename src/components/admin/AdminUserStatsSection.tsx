"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import type { AdminUserStats } from "@/lib/admin/user-stats";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

type MetricKey =
  | "registeredCustomers"
  | "registeredProviders"
  | "usersOnline"
  | "providersOnline"
  | "uniqueVisitors"
  | "totalVisits";

const METRICS: { key: MetricKey; online: boolean }[] = [
  { key: "registeredCustomers", online: false },
  { key: "registeredProviders", online: false },
  { key: "usersOnline", online: true },
  { key: "providersOnline", online: true },
  { key: "uniqueVisitors", online: false },
  { key: "totalVisits", online: false },
];

const ONLINE_POLL_MS = 30_000;

type LoadState =
  | { status: "loading" }
  | { status: "ready"; stats: AdminUserStats }
  | { status: "error" };

export function AdminUserStatsSection() {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (inFlight.current) return;
    inFlight.current = true;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!opts?.silent) {
      setState((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
      setRefreshing(true);
    }
    try {
      const res = await authFetch("/api/admin/user-stats", {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const data = (await res.json()) as { stats?: AdminUserStats; error?: string };
      if (!mounted.current || controller.signal.aborted) return;
      if (!res.ok || !data.stats) {
        if (!opts?.silent) setState({ status: "error" });
        return;
      }
      setState((prev) => {
        if (opts?.silent && prev.status === "ready") {
          return {
            status: "ready",
            stats: {
              ...prev.stats,
              usersOnline: data.stats!.usersOnline,
              providersOnline: data.stats!.providersOnline,
            },
          };
        }
        return { status: "ready", stats: data.stats! };
      });
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (!opts?.silent) setState({ status: "error" });
    } finally {
      inFlight.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();

    const onlineTimer = setInterval(() => {
      void load({ silent: true });
    }, ONLINE_POLL_MS);

    return () => {
      mounted.current = false;
      clearInterval(onlineTimer);
      abortRef.current?.abort();
    };
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary">
            {t("admin.userStats.title")}
          </h2>
          <p className="text-sm text-text-secondary">{t("admin.userStats.subtitle")}</p>
        </div>
        <Button
          variant="secondary"
          className="w-full shrink-0 gap-2 sm:w-auto"
          loading={refreshing && state.status !== "loading"}
          onClick={() => void load()}
        >
          <RefreshCw className="h-4 w-4" />
          {t("admin.refresh")}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {METRICS.map((metric) => (
          <StatCard
            key={metric.key}
            title={t(`admin.userStats.${metric.key}`)}
            hint={t(`admin.userStats.${metric.key}Hint`)}
            state={state}
            valueKey={metric.key}
            onRetry={() => void load()}
          />
        ))}
      </div>
    </div>
  );
}

function StatCard({
  title,
  hint,
  state,
  valueKey,
  onRetry,
}: {
  title: string;
  hint: string;
  state: LoadState;
  valueKey: MetricKey;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Card padding="md" className="min-h-[132px]">
      <p className="text-sm text-text-secondary">{title}</p>

      {state.status === "loading" && (
        <p className="mt-3 text-sm text-text-secondary">{t("common.loading")}</p>
      )}

      {state.status === "error" && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-danger">{t("admin.userStats.loadError")}</p>
          <Button variant="secondary" className="gap-2" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t("admin.userStats.retry")}
          </Button>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <p className="mt-1 text-2xl font-bold tabular-nums text-text-primary">
            {state.stats[valueKey].toLocaleString()}
          </p>
          <p className="mt-2 text-xs text-text-secondary">{hint}</p>
        </>
      )}
    </Card>
  );
}
