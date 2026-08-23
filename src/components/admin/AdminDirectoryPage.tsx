"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { AdminUserCard } from "@/components/admin/AdminUserCard";
import { AdminActivityTable } from "@/components/admin/AdminActivityTable";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useRequirePlatformAdmin } from "@/hooks/useRequirePlatformAdmin";
import { authFetch } from "@/lib/auth/client-fetch";
import type { AdminUserListItem } from "@/lib/admin/directory";
import { ADMIN_PAGE_SIZE } from "@/lib/admin/directory";
import { Search, Users } from "lucide-react";

type Kind = "customers" | "providers";

function parseOnlineOnlyParam(value: string | null): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function AdminDirectoryPageInner({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  const { pending, allowed } = useRequirePlatformAdmin();
  const searchParams = useSearchParams();
  const qFromUrl = searchParams.get("q") ?? "";
  const onlineOnlyFromUrl = parseOnlineOnlyParam(searchParams.get("onlineOnly"));

  const [q, setQ] = useState(qFromUrl);
  const [city, setCity] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [category, setCategory] = useState("");
  const [minRating, setMinRating] = useState("");
  const [minOrders, setMinOrders] = useState("");
  const [registeredFrom, setRegisteredFrom] = useState("");
  const [registeredTo, setRegisteredTo] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQ(qFromUrl);
    setPage(1);
  }, [qFromUrl]);

  const title =
    kind === "customers" ? t("admin.customers.title") : t("admin.providers.title");
  const subtitle =
    kind === "customers" ? t("admin.customers.subtitle") : t("admin.providers.subtitle");
  const activeHref = kind === "customers" ? "/admin/customers" : "/admin/providers";
  const apiPath = kind === "customers" ? "/api/admin/customers" : "/api/admin/providers";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (city.trim()) params.set("city", city.trim());
      if (status) params.set("status", status);
      if (sort) params.set("sort", sort);
      if (minOrders.trim()) params.set("minOrders", minOrders.trim());
      if (registeredFrom) params.set("registeredFrom", registeredFrom);
      if (registeredTo) params.set("registeredTo", registeredTo);
      if (kind === "providers" && category.trim()) params.set("category", category.trim());
      if (kind === "providers" && minRating.trim()) params.set("minRating", minRating.trim());
      params.set("page", String(page));

      const res = await authFetch(`${apiPath}?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(t("admin.errors.loadFailed"));
        setItems([]);
        setTotal(0);
        return;
      }
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError(t("admin.errors.loadFailed"));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    apiPath,
    category,
    city,
    kind,
    minOrders,
    minRating,
    page,
    q,
    registeredFrom,
    registeredTo,
    sort,
    status,
    t,
  ]);

  useEffect(() => {
    if (pending || !allowed) return;
    if (onlineOnlyFromUrl) return;
    void load();
  }, [pending, allowed, load, onlineOnlyFromUrl]);

  if (pending || !allowed) return null;

  if (onlineOnlyFromUrl) {
    return (
      <AppLayout hideNav title={title}>
        <div className="space-y-5 p-4 pb-8">
          <PageHeader
            title={title}
            subtitle={
              kind === "customers"
                ? t("admin.userStats.customersOnline")
                : t("admin.userStats.providersOnline")
            }
            historyBack
          />
          <AdminSectionNav activeHref={activeHref} />
          <AdminActivityTable kind={kind} initialOnlineOnly />
        </div>
      </AppLayout>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

  return (
    <AppLayout hideNav title={title}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader title={title} subtitle={subtitle} historyBack />
        <AdminSectionNav activeHref={activeHref} />

        <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder={t("admin.directory.searchPlaceholder")}
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              value={city}
              onChange={(e) => {
                setPage(1);
                setCity(e.target.value);
              }}
              placeholder={t("admin.directory.filterCity")}
            />
            <select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
              className="h-11 w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary"
            >
              <option value="all">{t("admin.directory.filterStatusAll")}</option>
              <option value="active">{t("admin.directory.statusActive")}</option>
            </select>
            <select
              value={sort}
              onChange={(e) => {
                setPage(1);
                setSort(e.target.value);
              }}
              className="h-11 w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary"
            >
              <option value="newest">{t("admin.directory.sortNewest")}</option>
              <option value="oldest">{t("admin.directory.sortOldest")}</option>
              <option value="most_active">{t("admin.directory.sortMostActive")}</option>
              <option value="activity">{t("admin.directory.sortActivity")}</option>
              {kind === "providers" && (
                <>
                  <option value="rating">{t("admin.directory.sortRating")}</option>
                  <option value="completed">{t("admin.directory.sortCompleted")}</option>
                </>
              )}
            </select>
            <Input
              value={minOrders}
              onChange={(e) => {
                setPage(1);
                setMinOrders(e.target.value);
              }}
              placeholder={
                kind === "customers"
                  ? t("admin.directory.filterMinOrders")
                  : t("admin.directory.filterMinCompleted")
              }
              inputMode="numeric"
            />
            <Input
              type="date"
              value={registeredFrom}
              onChange={(e) => {
                setPage(1);
                setRegisteredFrom(e.target.value);
              }}
              aria-label={t("admin.directory.filterRegisteredFrom")}
            />
            <Input
              type="date"
              value={registeredTo}
              onChange={(e) => {
                setPage(1);
                setRegisteredTo(e.target.value);
              }}
              aria-label={t("admin.directory.filterRegisteredTo")}
            />
            {kind === "providers" && (
              <>
                <Input
                  value={category}
                  onChange={(e) => {
                    setPage(1);
                    setCategory(e.target.value);
                  }}
                  placeholder={t("admin.directory.filterCategory")}
                />
                <Input
                  value={minRating}
                  onChange={(e) => {
                    setPage(1);
                    setMinRating(e.target.value);
                  }}
                  placeholder={t("admin.directory.filterMinRating")}
                  inputMode="decimal"
                />
              </>
            )}
          </div>
          <Button variant="secondary" className="w-full" loading={loading} onClick={() => void load()}>
            {t("admin.refresh")}
          </Button>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {!loading && items.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t("admin.directory.emptyUsers")}
            description={t("admin.directory.emptyUsersHint")}
          />
        ) : (
          <div className="space-y-3">
            {items.map((user) => (
              <AdminUserCard key={user.id} user={user} kind={kind} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("common.back")}
            </Button>
            <p className="text-xs text-text-muted">
              {page} / {totalPages}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("admin.directory.nextPage")}
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export function AdminDirectoryPage({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<p className="p-4 text-sm text-text-muted">{t("common.loading")}</p>}>
      <AdminDirectoryPageInner kind={kind} />
    </Suspense>
  );
}
