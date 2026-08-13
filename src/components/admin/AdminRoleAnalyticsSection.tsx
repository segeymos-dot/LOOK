"use client";

import { AdminMetricCards } from "@/components/admin/AdminMetricCards";
import { AdminActivityTable } from "@/components/admin/AdminActivityTable";
import { useAdminCustomerStats } from "@/components/admin/AdminCustomerStatsProvider";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import type { AdminProviderStats } from "@/lib/admin/role-stats";
import { useCancellableAdminLoad } from "@/hooks/useCancellableAdminLoad";
import { RefreshCw } from "lucide-react";

type Kind = "customers" | "providers";

async function fetchProviderStats(signal: AbortSignal): Promise<AdminProviderStats> {
  const res = await authFetch("/api/admin/provider-stats", { signal });
  const data = (await res.json()) as { stats?: AdminProviderStats; error?: string };
  if (!res.ok || !data.stats) {
    throw new Error(data.error || "Failed to load provider statistics");
  }
  return data.stats;
}

function CustomerAnalyticsBody() {
  const { t } = useTranslation();
  const { state, stats, refreshing, reload } = useAdminCustomerStats();
  const prefix = "admin.customerAnalytics";
  const s = stats;
  const directoryHref = "/admin/customers";

  const items = [
    {
      key: "registered",
      label: t(`${prefix}.registered`),
      value: s?.registeredTotal ?? null,
      href: directoryHref,
    },
    { key: "online", label: t(`${prefix}.online`), value: s?.online ?? null, href: directoryHref },
    {
      key: "activeToday",
      label: t(`${prefix}.activeToday`),
      value: s?.uniqueActiveToday ?? null,
      href: directoryHref,
    },
    {
      key: "active7d",
      label: t(`${prefix}.active7d`),
      value: s?.uniqueActive7d ?? null,
      href: directoryHref,
    },
    {
      key: "active30d",
      label: t(`${prefix}.active30d`),
      value: s?.uniqueActive30d ?? null,
      href: directoryHref,
    },
    {
      key: "sessionsToday",
      label: t(`${prefix}.sessionsToday`),
      value: s?.sessionsToday ?? null,
      href: directoryHref,
    },
    {
      key: "sessions7d",
      label: t(`${prefix}.sessions7d`),
      value: s?.sessions7d ?? null,
      href: directoryHref,
    },
    {
      key: "sessions30d",
      label: t(`${prefix}.sessions30d`),
      value: s?.sessions30d ?? null,
      href: directoryHref,
    },
    {
      key: "newToday",
      label: t(`${prefix}.newToday`),
      value: s?.newToday ?? null,
      href: directoryHref,
    },
    { key: "new7d", label: t(`${prefix}.new7d`), value: s?.new7d ?? null, href: directoryHref },
    { key: "new30d", label: t(`${prefix}.new30d`), value: s?.new30d ?? null, href: directoryHref },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary">{t(`${prefix}.title`)}</h2>
          <p className="text-sm text-text-secondary">{t(`${prefix}.subtitle`)}</p>
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
      <AdminActivityTable kind="customers" />
    </div>
  );
}

function ProviderAnalyticsBody() {
  const { t } = useTranslation();
  const { state, data: stats, refreshing, reload } = useCancellableAdminLoad<AdminProviderStats>({
    load: fetchProviderStats,
  });
  const prefix = "admin.providerAnalytics";
  const s = stats;
  const directoryHref = "/admin/providers";

  const items = [
    {
      key: "registered",
      label: t(`${prefix}.registered`),
      value: s?.registeredTotal ?? null,
      href: directoryHref,
    },
    { key: "online", label: t(`${prefix}.online`), value: s?.online ?? null, href: directoryHref },
    {
      key: "activeToday",
      label: t(`${prefix}.activeToday`),
      value: s?.uniqueActiveToday ?? null,
      href: directoryHref,
    },
    {
      key: "active7d",
      label: t(`${prefix}.active7d`),
      value: s?.uniqueActive7d ?? null,
      href: directoryHref,
    },
    {
      key: "active30d",
      label: t(`${prefix}.active30d`),
      value: s?.uniqueActive30d ?? null,
      href: directoryHref,
    },
    {
      key: "sessionsToday",
      label: t(`${prefix}.sessionsToday`),
      value: s?.sessionsToday ?? null,
      href: directoryHref,
    },
    {
      key: "sessions7d",
      label: t(`${prefix}.sessions7d`),
      value: s?.sessions7d ?? null,
      href: directoryHref,
    },
    {
      key: "sessions30d",
      label: t(`${prefix}.sessions30d`),
      value: s?.sessions30d ?? null,
      href: directoryHref,
    },
    {
      key: "newToday",
      label: t(`${prefix}.newToday`),
      value: s?.newToday ?? null,
      href: directoryHref,
    },
    { key: "new7d", label: t(`${prefix}.new7d`), value: s?.new7d ?? null, href: directoryHref },
    { key: "new30d", label: t(`${prefix}.new30d`), value: s?.new30d ?? null, href: directoryHref },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary">{t(`${prefix}.title`)}</h2>
          <p className="text-sm text-text-secondary">{t(`${prefix}.subtitle`)}</p>
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
      <AdminActivityTable kind="providers" />
    </div>
  );
}

export function AdminRoleAnalyticsSection({ kind }: { kind: Kind }) {
  if (kind === "customers") return <CustomerAnalyticsBody />;
  return <ProviderAnalyticsBody />;
}
