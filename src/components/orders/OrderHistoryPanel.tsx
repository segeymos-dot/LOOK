"use client";

import { OrderHistoryCard } from "@/components/orders/OrderHistoryCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import type {
  OrderHistoryItem,
  OrderHistorySort,
  OrderHistoryTab,
} from "@/lib/orders/history-types";
import { cn } from "@/lib/utils";
import { ChevronDown, ClipboardList, RefreshCw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const TABS: OrderHistoryTab[] = [
  "active",
  "completed",
  "cancelled_refunded",
  "disputed",
  "archived",
  "all",
];

function parseTab(raw: string | null): OrderHistoryTab | null {
  if (!raw) return null;
  return (TABS as string[]).includes(raw) ? (raw as OrderHistoryTab) : null;
}

type Props = {
  viewer: "customer" | "provider" | "admin";
  apiPath: string;
  showAdminFilters?: boolean;
  allowExport?: boolean;
};

export function OrderHistoryPanel({
  viewer,
  apiPath,
  showAdminFilters = false,
  allowExport = false,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tabFromUrl = parseTab(tabParam);

  const [tab, setTab] = useState<OrderHistoryTab>(tabFromUrl ?? "all");
  const [sort, setSort] = useState<OrderHistorySort>("newest");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [location, setLocation] = useState("");
  const [testOnly, setTestOnly] = useState<"" | "1" | "0">("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<OrderHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    const next = parseTab(tabParam);
    if (!next) return;
    setTab(next);
    setPage(1);
  }, [tabParam]);

  const selectTab = (key: OrderHistoryTab) => {
    setTab(key);
    setPage(1);
    if (viewer !== "admin") return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("tab", tab);
      params.set("sort", sort);
      params.set("page", String(page));
      if (viewer !== "admin") params.set("viewer", viewer);
      if (q.trim()) params.set("q", q.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (customerId.trim()) params.set("customerId", customerId.trim());
      if (providerId.trim()) params.set("providerId", providerId.trim());
      if (location.trim()) params.set("location", location.trim());
      if (testOnly) params.set("testOnly", testOnly);

      const res = await authFetch(`${apiPath}?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("orderHistory.loadError"));
        setItems([]);
        setTotal(0);
        return;
      }
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPageSize(data.pageSize ?? 20);
    } catch {
      setError(t("orderHistory.loadError"));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    apiPath,
    viewer,
    tab,
    sort,
    page,
    q,
    from,
    to,
    customerId,
    providerId,
    location,
    testOnly,
    t,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const onArchive = async (id: string, archived: boolean) => {
    const res = await authFetch("/api/orders/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: id, archived }),
    });
    if (res.ok) await load();
  };

  const exportCsv = async () => {
    const params = new URLSearchParams();
    params.set("export", "csv");
    params.set("tab", tab);
    params.set("sort", sort);
    if (q.trim()) params.set("q", q.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (customerId.trim()) params.set("customerId", customerId.trim());
    if (providerId.trim()) params.set("providerId", providerId.trim());
    if (location.trim()) params.set("location", location.trim());
    if (testOnly) params.set("testOnly", testOnly);

    const res = await authFetch(`${apiPath}?${params.toString()}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `look-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("orderHistory.tabs.all")}>
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => selectTab(key)}
            className={cn(
              "inline-flex min-h-[44px] items-center rounded-full px-3.5 text-xs font-semibold transition-colors",
              tab === key
                ? "bg-brand-600 text-white"
                : "bg-surface text-text-secondary ring-1 ring-border-subtle hover:bg-surface-muted"
            )}
          >
            {t(`orderHistory.tabs.${key}`)}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          label={t("orderHistory.search")}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder={t("orderHistory.searchPlaceholder")}
        />
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-text-primary">{t("orderHistory.sort")}</span>
          <select
            className="w-full rounded-xl border border-border bg-surface px-4 py-3"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as OrderHistorySort);
              setPage(1);
            }}
          >
            <option value="newest">{t("orderHistory.sorts.newest")}</option>
            <option value="oldest">{t("orderHistory.sorts.oldest")}</option>
            <option value="amount_desc">{t("orderHistory.sorts.amount_desc")}</option>
            <option value="amount_asc">{t("orderHistory.sorts.amount_asc")}</option>
            <option value="status">{t("orderHistory.sorts.status")}</option>
            <option value="activity">{t("orderHistory.sorts.activity")}</option>
          </select>
        </label>
      </div>

      {showAdminFilters ? (
        <div className="space-y-2">
          <button
            type="button"
            className={cn(
              "inline-flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-3 text-sm font-semibold text-text-primary ring-1 ring-border-subtle sm:hidden",
              "hover:bg-surface-muted"
            )}
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <span>{t("orderHistory.advancedFilters")}</span>
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")}
              aria-hidden
            />
          </button>
          <div
            className={cn(
              "grid gap-2 sm:grid-cols-2",
              advancedOpen ? "grid" : "hidden sm:grid"
            )}
          >
            <Input
              label={t("orderHistory.filters.customerId")}
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setPage(1);
              }}
            />
            <Input
              label={t("orderHistory.filters.providerId")}
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value);
                setPage(1);
              }}
            />
            <Input
              label={t("orderHistory.filters.location")}
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setPage(1);
              }}
            />
            <Input
              label={t("orderHistory.filters.from")}
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
            <Input
              label={t("orderHistory.filters.to")}
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-text-primary">
                {t("orderHistory.filters.testMarker")}
              </span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-4 py-3"
                value={testOnly}
                onChange={(e) => {
                  setTestOnly(e.target.value as "" | "1" | "0");
                  setPage(1);
                }}
              >
                <option value="">{t("orderHistory.filters.testAll")}</option>
                <option value="1">{t("orderHistory.filters.testOnly")}</option>
                <option value="0">{t("orderHistory.filters.productionOnly")}</option>
              </select>
            </label>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] gap-1"
          loading={loading}
          onClick={() => void load()}
        >
          <RefreshCw className="h-4 w-4" />
          {t("orderHistory.refresh")}
        </Button>
        {allowExport ? (
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            onClick={() => void exportCsv()}
          >
            {t("orderHistory.exportCsv")}
          </Button>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">{t("common.loading")}</p>
      ) : error ? (
        <p className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t("orderHistory.emptyTitle")}
          description={t("orderHistory.emptyDesc")}
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <OrderHistoryCard
              key={`${item.id}-${item.offer_id ?? "req"}`}
              item={item}
              viewer={viewer}
              onArchive={
                tab === "archived" || viewer !== "admin"
                  ? (id, archived) => void onArchive(id, archived)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px]"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t("orderHistory.prev")}
          </Button>
          <p className="text-xs text-text-muted">
            {t("orderHistory.pageOf", { page, total: totalPages, count: total })}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px]"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("orderHistory.next")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
