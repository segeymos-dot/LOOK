"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import type { ActivityListItem } from "@/lib/admin/role-activity";
import { useCancellableAdminLoad } from "@/hooks/useCancellableAdminLoad";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

type Kind = "customers" | "providers";

type ActivityPayload = {
  items: ActivityListItem[];
  total: number;
  page: number;
  pageSize: number;
};

function formatDate(value: string | null, locale: string) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(locale === "en" ? "en-GB" : "ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

export function AdminActivityTable({
  kind,
  initialOnlineOnly = false,
}: {
  kind: Kind;
  /** Prefill «online only» (home tile / deep link). */
  initialOnlineOnly?: boolean;
}) {
  const { t, locale } = useTranslation();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [onlineOnly, setOnlineOnly] = useState(Boolean(initialOnlineOnly));
  const [neverOrdered, setNeverOrdered] = useState(false);
  const [hasActiveOrders, setHasActiveOrders] = useState(false);
  const [registeredFrom, setRegisteredFrom] = useState("");
  const [registeredTo, setRegisteredTo] = useState("");
  const [activityFrom, setActivityFrom] = useState("");
  const [activityTo, setActivityTo] = useState("");
  const [appliedQ, setAppliedQ] = useState("");

  const prefix = kind === "customers" ? "admin.customerActivity" : "admin.providerActivity";
  const endpoint =
    kind === "customers" ? "/api/admin/customers" : "/api/admin/providers";

  const loadPage = useCallback(
    async (signal: AbortSignal): Promise<ActivityPayload> => {
      const params = new URLSearchParams();
      params.set("view", "activity");
      params.set("page", String(page));
      params.set("sort", sort);
      if (appliedQ.trim()) params.set("q", appliedQ.trim());
      if (onlineOnly) params.set("onlineOnly", "1");
      if (kind === "customers" && neverOrdered) params.set("neverOrdered", "1");
      if (kind === "customers" && hasActiveOrders) params.set("hasActiveOrders", "1");
      if (registeredFrom) params.set("registeredFrom", registeredFrom);
      if (registeredTo) params.set("registeredTo", registeredTo);
      if (activityFrom) params.set("activityFrom", activityFrom);
      if (activityTo) params.set("activityTo", activityTo);

      const res = await authFetch(`${endpoint}?${params.toString()}`, { signal });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load activity");
      }
      return {
        items: data.items ?? [],
        total: Number(data.total ?? 0),
        page: Number(data.page ?? 1),
        pageSize: Number(data.pageSize ?? 20),
      };
    },
    [
      activityFrom,
      activityTo,
      appliedQ,
      endpoint,
      hasActiveOrders,
      kind,
      neverOrdered,
      onlineOnly,
      page,
      registeredFrom,
      registeredTo,
      sort,
    ]
  );

  const { state, data, reload } = useCancellableAdminLoad<ActivityPayload>({
    load: loadPage,
    deps: [
      kind,
      page,
      sort,
      onlineOnly,
      neverOrdered,
      hasActiveOrders,
      registeredFrom,
      registeredTo,
      activityFrom,
      activityTo,
      appliedQ,
    ],
  });

  // Keep page in sync with server response when filters reset page externally.
  useEffect(() => {
    if (data?.page && data.page !== page) setPage(data.page);
  }, [data?.page, page]);

  const items = data?.items ?? null;
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card padding="md" className="space-y-4 overflow-hidden">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{t(`${prefix}.title`)}</h3>
        <p className="text-xs text-text-secondary">{t(`${prefix}.subtitle`)}</p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t(`${prefix}.searchPlaceholder`)}
        />
        <select
          className="h-11 rounded-xl border border-border bg-surface px-3 text-sm text-text-primary"
          value={sort}
          onChange={(e) => {
            setPage(1);
            setSort(e.target.value);
          }}
        >
          <option value="newest">{t("admin.activityFilters.sortNewest")}</option>
          <option value="oldest">{t("admin.activityFilters.sortOldest")}</option>
          <option value="activity">{t("admin.activityFilters.sortActivity")}</option>
          <option value="name">{t("admin.activityFilters.sortName")}</option>
        </select>
        <Input
          type="date"
          value={registeredFrom}
          onChange={(e) => {
            setPage(1);
            setRegisteredFrom(e.target.value);
          }}
          aria-label={t("admin.activityFilters.registeredFrom")}
        />
        <Input
          type="date"
          value={registeredTo}
          onChange={(e) => {
            setPage(1);
            setRegisteredTo(e.target.value);
          }}
          aria-label={t("admin.activityFilters.registeredTo")}
        />
        <Input
          type="date"
          value={activityFrom}
          onChange={(e) => {
            setPage(1);
            setActivityFrom(e.target.value);
          }}
          aria-label={t("admin.activityFilters.activityFrom")}
        />
        <Input
          type="date"
          value={activityTo}
          onChange={(e) => {
            setPage(1);
            setActivityTo(e.target.value);
          }}
          aria-label={t("admin.activityFilters.activityTo")}
        />
      </div>

      <div className="flex flex-wrap gap-3 text-sm text-text-secondary">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={onlineOnly}
            onChange={(e) => {
              setPage(1);
              setOnlineOnly(e.target.checked);
            }}
          />
          {t("admin.activityFilters.onlineOnly")}
        </label>
        {kind === "customers" && (
          <>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={neverOrdered}
                onChange={(e) => {
                  setPage(1);
                  setNeverOrdered(e.target.checked);
                }}
              />
              {t("admin.activityFilters.neverOrdered")}
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={hasActiveOrders}
                onChange={(e) => {
                  setPage(1);
                  setHasActiveOrders(e.target.checked);
                }}
              />
              {t("admin.activityFilters.hasActiveOrders")}
            </label>
          </>
        )}
        <Button
          variant="secondary"
          className="gap-2"
          onClick={() => {
            setPage(1);
            setAppliedQ(q);
            void reload();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("admin.activityFilters.apply")}
        </Button>
      </div>

      {state === "loading" && (
        <p className="text-sm text-text-secondary">{t("common.loading")}</p>
      )}
      {state === "error" && (
        <div className="space-y-2">
          <p className="text-sm text-danger">{t("admin.userStats.loadError")}</p>
          <Button variant="secondary" className="gap-2" onClick={() => void reload()}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t("admin.userStats.retry")}
          </Button>
        </div>
      )}

      {state === "ready" && items && items.length === 0 && (
        <p className="text-sm text-text-secondary">{t(`${prefix}.empty`)}</p>
      )}

      {state === "ready" && items && items.length > 0 && (
        <div className="-mx-1 overflow-x-auto">
          <table className="min-w-[920px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th className="px-2 py-2 font-medium">{t(`${prefix}.colName`)}</th>
                <th className="px-2 py-2 font-medium">{t(`${prefix}.colEmail`)}</th>
                <th className="px-2 py-2 font-medium">{t(`${prefix}.colRole`)}</th>
                <th className="px-2 py-2 font-medium">{t(`${prefix}.colRegistered`)}</th>
                <th className="px-2 py-2 font-medium">{t(`${prefix}.colLastActivity`)}</th>
                <th className="px-2 py-2 font-medium">{t(`${prefix}.colOnline`)}</th>
                <th className="px-2 py-2 font-medium">{t(`${prefix}.colSessions`)}</th>
                {kind === "customers" ? (
                  <>
                    <th className="px-2 py-2 font-medium">{t(`${prefix}.colOrders`)}</th>
                    <th className="px-2 py-2 font-medium">{t(`${prefix}.colActive`)}</th>
                    <th className="px-2 py-2 font-medium">{t(`${prefix}.colCompleted`)}</th>
                    <th className="px-2 py-2 font-medium">{t(`${prefix}.colCancelled`)}</th>
                    <th className="px-2 py-2 font-medium">{t(`${prefix}.colLastOrder`)}</th>
                  </>
                ) : (
                  <>
                    <th className="px-2 py-2 font-medium">{t(`${prefix}.colOffers`)}</th>
                    <th className="px-2 py-2 font-medium">{t(`${prefix}.colAccepted`)}</th>
                    <th className="px-2 py-2 font-medium">{t(`${prefix}.colActive`)}</th>
                    <th className="px-2 py-2 font-medium">{t(`${prefix}.colCompleted`)}</th>
                    <th className="px-2 py-2 font-medium">{t(`${prefix}.colLastOffer`)}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-border/60 text-text-primary">
                  <td className="px-2 py-2 font-medium">{row.fullName}</td>
                  <td className="px-2 py-2 text-text-secondary">{row.email ?? "—"}</td>
                  <td className="px-2 py-2">{row.role}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {formatDate(row.createdAt, locale)}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {formatDate(row.lastActivityAt, locale)}
                  </td>
                  <td className="px-2 py-2">
                    {row.isOnline
                      ? t("admin.activityFilters.online")
                      : t("admin.activityFilters.offline")}
                  </td>
                  <td className="px-2 py-2 tabular-nums">{row.sessionsCount}</td>
                  {kind === "customers" ? (
                    <>
                      <td className="px-2 py-2 tabular-nums">{row.ordersCreated}</td>
                      <td className="px-2 py-2 tabular-nums">{row.ordersActive}</td>
                      <td className="px-2 py-2 tabular-nums">{row.ordersCompleted}</td>
                      <td className="px-2 py-2 tabular-nums">{row.ordersCancelled}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {formatDate(row.lastOrderAt, locale)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-2 tabular-nums">{row.offersSubmitted}</td>
                      <td className="px-2 py-2 tabular-nums">{row.jobsAccepted}</td>
                      <td className="px-2 py-2 tabular-nums">{row.jobsActive}</td>
                      <td className="px-2 py-2 tabular-nums">{row.jobsCompleted}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {formatDate(row.lastOfferAt, locale)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state === "ready" && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">
            {t("admin.activityFilters.pageOf", { page, total: totalPages })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("admin.activityFilters.prev")}
            </Button>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("admin.activityFilters.next")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
