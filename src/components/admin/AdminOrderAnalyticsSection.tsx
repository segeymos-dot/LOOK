"use client";

import { AdminMetricCards } from "@/components/admin/AdminMetricCards";
import { useAdminCustomerStats } from "@/components/admin/AdminCustomerStatsProvider";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { RefreshCw } from "lucide-react";

function formatHours(value: number | null, t: (k: string, v?: Record<string, string | number>) => string) {
  if (value == null || Number.isNaN(value)) return "—";
  return t("admin.orderAnalytics.hoursValue", { hours: value });
}

export function AdminOrderAnalyticsSection() {
  const { t } = useTranslation();
  const { state, stats, refreshing, reload } = useAdminCustomerStats();
  const orders = stats?.orders ?? null;

  const o = orders;
  const items = [
    {
      key: "total",
      label: t("admin.orderAnalytics.total"),
      value: o?.total ?? null,
      href: "/admin/orders?tab=all",
    },
    {
      key: "today",
      label: t("admin.orderAnalytics.today"),
      value: o?.today ?? null,
      href: "/admin/orders?tab=all",
    },
    {
      key: "d7",
      label: t("admin.orderAnalytics.d7"),
      value: o?.d7 ?? null,
      href: "/admin/orders?tab=all",
    },
    {
      key: "d30",
      label: t("admin.orderAnalytics.d30"),
      value: o?.d30 ?? null,
      href: "/admin/orders?tab=all",
    },
    {
      key: "withOrders",
      label: t("admin.orderAnalytics.customersWithOrders"),
      value: o?.customersWithOrders ?? null,
      href: "/admin/customers",
    },
    {
      key: "withoutOrders",
      label: t("admin.orderAnalytics.customersWithoutOrders"),
      value: o?.customersWithoutOrders ?? null,
      href: "/admin/customers",
    },
    {
      key: "avg",
      label: t("admin.orderAnalytics.avgOrders"),
      value: o?.avgOrdersPerActiveCustomer ?? null,
    },
    {
      key: "open",
      label: t("admin.orderAnalytics.open"),
      value: o?.open ?? null,
      href: "/admin/orders?tab=active",
    },
    {
      key: "inProgress",
      label: t("admin.orderAnalytics.inProgress"),
      value: o?.inProgress ?? null,
      href: "/admin/orders?tab=active",
    },
    {
      key: "completed",
      label: t("admin.orderAnalytics.completed"),
      value: o?.completed ?? null,
      href: "/admin/orders?tab=completed",
    },
    {
      key: "cancelled",
      label: t("admin.orderAnalytics.cancelled"),
      value: o?.cancelled ?? null,
      href: "/admin/orders?tab=cancelled_refunded",
    },
    {
      key: "withoutOffers",
      label: t("admin.orderAnalytics.withoutOffers"),
      value: o?.withoutOffers ?? null,
      href: "/admin/orders?tab=active",
    },
    {
      key: "withOffers",
      label: t("admin.orderAnalytics.withOffers"),
      value: o?.withOffers ?? null,
      href: "/admin/orders?tab=active",
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
      href: "/admin/orders?tab=active",
    },
    {
      key: "confirmed",
      label: t("admin.orderAnalytics.customerConfirmed"),
      value: o?.customerConfirmedCompletions ?? null,
      href: "/admin/orders?tab=completed",
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
          onClick={() => void reload()}
        >
          <RefreshCw className="h-4 w-4" />
          {t("admin.refresh")}
        </Button>
      </div>

      <AdminMetricCards items={items} state={state} onRetry={() => void reload()} />
    </div>
  );
}
