"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useRequirePlatformAdmin } from "@/hooks/useRequirePlatformAdmin";
import { authFetch } from "@/lib/auth/client-fetch";
import { useCancellableAdminLoad } from "@/hooks/useCancellableAdminLoad";
import { cn } from "@/lib/utils";
import type {
  CountryTrafficRow,
  VisitorsByCountryRange,
  VisitorsByCountryStats,
} from "@/lib/analytics/visitors-by-country";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

type SortMode = "unique" | "visits";

async function loadCountries(
  signal: AbortSignal,
  range: VisitorsByCountryRange
): Promise<VisitorsByCountryStats> {
  const res = await authFetch(
    `/api/admin/analytics/countries?range=${encodeURIComponent(range)}`,
    { signal, cache: "no-store" }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to load country analytics");
  }
  return {
    total_visits: Number(data.total_visits ?? 0),
    unique_visitors: Number(data.unique_visitors ?? 0),
    countries_count: Number(data.countries_count ?? 0),
    range: data.range ?? range,
    countries: Array.isArray(data.countries) ? data.countries : [],
  };
}

export default function AdminVisitorsByCountryPage() {
  const { t } = useTranslation();
  const { pending, allowed } = useRequirePlatformAdmin();
  const [range, setRange] = useState<VisitorsByCountryRange>("30d");
  const [sortMode, setSortMode] = useState<SortMode>("unique");

  const { state, data, refreshing, reload } =
    useCancellableAdminLoad<VisitorsByCountryStats>({
      load: (signal) => loadCountries(signal, range),
      deps: [range],
    });

  const countries = useMemo(() => {
    const rows = [...(data?.countries ?? [])];
    rows.sort((a, b) => {
      if (sortMode === "visits") {
        return b.visits - a.visits || b.unique_visitors - a.unique_visitors;
      }
      return b.unique_visitors - a.unique_visitors || b.visits - a.visits;
    });
    return rows;
  }, [data?.countries, sortMode]);

  if (pending || !allowed) return null;

  const ranges: { key: VisitorsByCountryRange; label: string }[] = [
    { key: "today", label: t("admin.visitorsByCountry.rangeToday") },
    { key: "7d", label: t("admin.visitorsByCountry.range7d") },
    { key: "30d", label: t("admin.visitorsByCountry.range30d") },
    { key: "all", label: t("admin.visitorsByCountry.rangeAll") },
  ];

  return (
    <AppLayout hideNav title={t("admin.visitorsByCountry.title")}>
      <div className="space-y-6 p-4 pb-10" data-testid="admin-visitors-by-country">
        <PageHeader
          title={t("admin.visitorsByCountry.title")}
          subtitle={t("admin.visitorsByCountry.subtitle")}
          historyBack
          historyBackHref="/"
        />

        <div className="flex flex-wrap gap-2">
          {ranges.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setRange(item.key)}
              className={cn(
                "min-h-[40px] rounded-full px-3.5 text-xs font-semibold transition-colors",
                range === item.key
                  ? "bg-brand-600 text-white"
                  : "bg-surface text-text-secondary ring-1 ring-border-subtle"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSortMode("unique")}
              className={cn(
                "min-h-[40px] rounded-full px-3.5 text-xs font-semibold transition-colors",
                sortMode === "unique"
                  ? "bg-brand-50 text-brand-800 ring-1 ring-brand-500/40"
                  : "bg-surface text-text-secondary ring-1 ring-border-subtle"
              )}
            >
              {t("admin.visitorsByCountry.sortUnique")}
            </button>
            <button
              type="button"
              onClick={() => setSortMode("visits")}
              className={cn(
                "min-h-[40px] rounded-full px-3.5 text-xs font-semibold transition-colors",
                sortMode === "visits"
                  ? "bg-brand-50 text-brand-800 ring-1 ring-brand-500/40"
                  : "bg-surface text-text-secondary ring-1 ring-border-subtle"
              )}
            >
              {t("admin.visitorsByCountry.sortVisits")}
            </button>
          </div>
          <Button
            variant="secondary"
            className="gap-2"
            loading={refreshing && state !== "loading"}
            onClick={() => void reload()}
          >
            <RefreshCw className="h-4 w-4" />
            {t("admin.refresh")}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard
            label={t("admin.visitorsByCountry.totalVisits")}
            value={state === "ready" ? data?.total_visits ?? 0 : null}
            loading={state === "loading"}
          />
          <SummaryCard
            label={t("admin.visitorsByCountry.uniqueVisitors")}
            value={state === "ready" ? data?.unique_visitors ?? 0 : null}
            loading={state === "loading"}
          />
          <SummaryCard
            label={t("admin.visitorsByCountry.countries")}
            value={state === "ready" ? data?.countries_count ?? 0 : null}
            loading={state === "loading"}
          />
        </div>

        {state === "error" ? (
          <Card padding="md">
            <p className="text-sm text-danger">{t("admin.visitorsByCountry.loadError")}</p>
            <Button variant="secondary" className="mt-3 gap-2" onClick={() => void reload()}>
              <RefreshCw className="h-4 w-4" />
              {t("admin.visitorsByCountry.retry")}
            </Button>
          </Card>
        ) : null}

        {state === "ready" && countries.length === 0 ? (
          <Card padding="md">
            <p className="text-sm text-text-secondary">
              {t("admin.visitorsByCountry.empty")}
            </p>
          </Card>
        ) : null}

        <div className="space-y-3">
          {state === "loading"
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} padding="md" className="min-h-[96px] animate-pulse bg-surface-muted" />
              ))
            : countries.map((row) => (
                <CountryCard key={row.country_code} row={row} />
              ))}
        </div>
      </div>
    </AppLayout>
  );
}

function SummaryCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | null;
  loading: boolean;
}) {
  return (
    <Card padding="md" className="min-h-[96px]">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-text-primary">
        {loading || value == null ? "—" : value.toLocaleString()}
      </p>
    </Card>
  );
}

function CountryCard({ row }: { row: CountryTrafficRow }) {
  const { t } = useTranslation();
  return (
    <Card
      padding="md"
      data-testid={`country-row-${row.country_code}`}
      data-unique={String(row.unique_visitors)}
      data-visits={String(row.visits)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-text-primary">
            <span aria-hidden className="mr-1.5">
              {row.flag}
            </span>
            {row.country_name}
            <span className="ml-2 text-xs font-medium text-text-muted">
              {row.country_code}
            </span>
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            {t("admin.visitorsByCountry.visitsLabel")}:{" "}
            <span className="font-semibold tabular-nums text-text-primary">
              {row.visits.toLocaleString()}
            </span>
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {t("admin.visitorsByCountry.uniqueLabel")}:{" "}
            <span className="font-semibold tabular-nums text-text-primary">
              {row.unique_visitors.toLocaleString()}
            </span>
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {t("admin.visitorsByCountry.registered")}: {row.registered_users.toLocaleString()}
            {" · "}
            {t("admin.visitorsByCountry.guests")}: {row.guests.toLocaleString()}
          </p>
        </div>
        <p className="shrink-0 text-lg font-bold tabular-nums text-brand-700">
          {row.percentage}%
        </p>
      </div>
    </Card>
  );
}
