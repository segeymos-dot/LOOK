"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import type { ActivityListItem } from "@/lib/admin/role-activity";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

type Kind = "customers" | "providers";

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

export function AdminActivityTable({ kind }: { kind: Kind }) {
  const { t, locale } = useTranslation();
  const [items, setItems] = useState<ActivityListItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [neverOrdered, setNeverOrdered] = useState(false);
  const [hasActiveOrders, setHasActiveOrders] = useState(false);
  const [registeredFrom, setRegisteredFrom] = useState("");
  const [registeredTo, setRegisteredTo] = useState("");
  const [activityFrom, setActivityFrom] = useState("");
  const [activityTo, setActivityTo] = useState("");
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const prefix = kind === "customers" ? "admin.customerActivity" : "admin.providerActivity";
  const endpoint =
    kind === "customers" ? "/api/admin/customers" : "/api/admin/providers";

  const load = useCallback(
    async (pageOverride?: number) => {
      if (inFlight.current) return;
      inFlight.current = true;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState((prev) => (prev === "ready" ? prev : "loading"));
      try {
        const params = new URLSearchParams();
        params.set("view", "activity");
        params.set("page", String(pageOverride ?? page));
        params.set("sort", sort);
        if (q.trim()) params.set("q", q.trim());
        if (onlineOnly) params.set("onlineOnly", "1");
        if (kind === "customers" && neverOrdered) params.set("neverOrdered", "1");
        if (kind === "customers" && hasActiveOrders) params.set("hasActiveOrders", "1");
        if (registeredFrom) params.set("registeredFrom", registeredFrom);
        if (registeredTo) params.set("registeredTo", registeredTo);
        if (activityFrom) params.set("activityFrom", activityFrom);
        if (activityTo) params.set("activityTo", activityTo);

        const res = await authFetch(`${endpoint}?${params.toString()}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const data = await res.json();
        if (!mounted.current || controller.signal.aborted) return;
        if (!res.ok) {
          setState("error");
          setItems(null);
          return;
        }
        setItems(data.items ?? []);
        setTotal(Number(data.total ?? 0));
        setPage(Number(data.page ?? 1));
        setPageSize(Number(data.pageSize ?? 20));
        setState("ready");
      } catch (error) {
        if (!mounted.current) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState("error");
        setItems(null);
      } finally {
        inFlight.current = false;
      }
    },
    [
      activityFrom,
      activityTo,
      endpoint,
      hasActiveOrders,
      kind,
      neverOrdered,
      onlineOnly,
      page,
      q,
      registeredFrom,
      registeredTo,
      sort,
    ]
  );

  useEffect(() => {
    mounted.current = true;
    void load(1);
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    kind,
    sort,
    onlineOnly,
    neverOrdered,
    hasActiveOrders,
    registeredFrom,
    registeredTo,
    activityFrom,
    activityTo,
  ]);

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
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="newest">{t("admin.activityFilters.sortNewest")}</option>
          <option value="oldest">{t("admin.activityFilters.sortOldest")}</option>
          <option value="activity">{t("admin.activityFilters.sortActivity")}</option>
          <option value="name">{t("admin.activityFilters.sortName")}</option>
        </select>
        <Input
          type="date"
          value={registeredFrom}
          onChange={(e) => setRegisteredFrom(e.target.value)}
          aria-label={t("admin.activityFilters.registeredFrom")}
        />
        <Input
          type="date"
          value={registeredTo}
          onChange={(e) => setRegisteredTo(e.target.value)}
          aria-label={t("admin.activityFilters.registeredTo")}
        />
        <Input
          type="date"
          value={activityFrom}
          onChange={(e) => setActivityFrom(e.target.value)}
          aria-label={t("admin.activityFilters.activityFrom")}
        />
        <Input
          type="date"
          value={activityTo}
          onChange={(e) => setActivityTo(e.target.value)}
          aria-label={t("admin.activityFilters.activityTo")}
        />
      </div>

      <div className="flex flex-wrap gap-3 text-sm text-text-secondary">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={onlineOnly}
            onChange={(e) => setOnlineOnly(e.target.checked)}
          />
          {t("admin.activityFilters.onlineOnly")}
        </label>
        {kind === "customers" && (
          <>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={neverOrdered}
                onChange={(e) => setNeverOrdered(e.target.checked)}
              />
              {t("admin.activityFilters.neverOrdered")}
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={hasActiveOrders}
                onChange={(e) => setHasActiveOrders(e.target.checked)}
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
            void load(1);
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
          <Button variant="secondary" className="gap-2" onClick={() => void load()}>
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
              onClick={() => {
                const next = page - 1;
                setPage(next);
                void load(next);
              }}
            >
              {t("admin.activityFilters.prev")}
            </Button>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => {
                const next = page + 1;
                setPage(next);
                void load(next);
              }}
            >
              {t("admin.activityFilters.next")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
