"use client";

import { AdminMetricCards } from "@/components/admin/AdminMetricCards";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import type { CustomerOrderStats } from "@/lib/admin/role-stats";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

function formatHours(value: number | null, t: (k: string, v?: Record<string, string | number>) => string) {
  if (value == null || Number.isNaN(value)) return "—";
  return t("admin.orderAnalytics.hoursValue", { hours: value });
}

export function AdminOrderAnalyticsSection() {
  const { t } = useTranslation();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [orders, setOrders] = useState<CustomerOrderStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRefreshing(true);
    setState((prev) => (prev === "ready" ? prev : "loading"));
    try {
      const res = await authFetch("/api/admin/customer-stats", {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const data = await res.json();
      if (!mounted.current || controller.signal.aborted) return;
      if (!res.ok || !data.stats?.orders) {
        setState("error");
        setOrders(null);
        return;
      }
      setOrders(data.stats.orders as CustomerOrderStats);
      setState("ready");
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState("error");
      setOrders(null);
    } finally {
      inFlight.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const o = orders;
  const items = [
    { key: "total", label: t("admin.orderAnalytics.total"), value: o?.total ?? null },
    { key: "today", label: t("admin.orderAnalytics.today"), value: o?.today ?? null },
    { key: "d7", label: t("admin.orderAnalytics.d7"), value: o?.d7 ?? null },
    { key: "d30", label: t("admin.orderAnalytics.d30"), value: o?.d30 ?? null },
    {
      key: "withOrders",
      label: t("admin.orderAnalytics.customersWithOrders"),
      value: o?.customersWithOrders ?? null,
    },
    {
      key: "withoutOrders",
      label: t("admin.orderAnalytics.customersWithoutOrders"),
      value: o?.customersWithoutOrders ?? null,
    },
    {
      key: "avg",
      label: t("admin.orderAnalytics.avgOrders"),
      value: o?.avgOrdersPerActiveCustomer ?? null,
    },
    { key: "open", label: t("admin.orderAnalytics.open"), value: o?.open ?? null },
    {
      key: "inProgress",
      label: t("admin.orderAnalytics.inProgress"),
      value: o?.inProgress ?? null,
    },
    {
      key: "completed",
      label: t("admin.orderAnalytics.completed"),
      value: o?.completed ?? null,
    },
    {
      key: "cancelled",
      label: t("admin.orderAnalytics.cancelled"),
      value: o?.cancelled ?? null,
    },
    {
      key: "withoutOffers",
      label: t("admin.orderAnalytics.withoutOffers"),
      value: o?.withoutOffers ?? null,
    },
    {
      key: "withOffers",
      label: t("admin.orderAnalytics.withOffers"),
      value: o?.withOffers ?? null,
    },
    {
      key: "avgFirst",
      label: t("admin.orderAnalytics.avgToFirstOffer"),
      value: state === "ready" ? formatHours(o?.avgHoursToFirstOffer ?? null, t) : null,
    },
    {
      key: "avgAccept",
      label: t("admin.orderAnalytics.avgToProviderSelected"),
      value: state === "ready" ? formatHours(o?.avgHoursToProviderSelected ?? null, t) : null,
    },
    {
      key: "selected",
      label: t("admin.orderAnalytics.withProviderSelected"),
      value: o?.withProviderSelected ?? null,
    },
    {
      key: "confirmed",
      label: t("admin.orderAnalytics.customerConfirmed"),
      value: o?.customerConfirmedCompletions ?? null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary">
            {t("admin.orderAnalytics.title")}
          </h2>
          <p className="text-sm text-text-secondary">{t("admin.orderAnalytics.subtitle")}</p>
        </div>
        <Button
          variant="secondary"
          className="w-full shrink-0 gap-2 sm:w-auto"
          loading={refreshing && state !== "loading"}
          onClick={() => void load()}
        >
          <RefreshCw className="h-4 w-4" />
          {t("admin.refresh")}
        </Button>
      </div>
      <AdminMetricCards items={items} state={state} onRetry={() => void load()} />
    </div>
  );
}
