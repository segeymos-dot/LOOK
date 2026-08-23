"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useRequirePlatformAdmin } from "@/hooks/useRequirePlatformAdmin";
import { authFetch } from "@/lib/auth/client-fetch";
import { formatPrice } from "@/lib/utils";
import type { AdminDisputeListItem } from "@/lib/admin/disputes";
import { Scale } from "lucide-react";

export default function AdminDisputesPage() {
  const { t, locale } = useTranslation();
  const { pending, allowed } = useRequirePlatformAdmin();

  const [status, setStatus] = useState("open");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [requestId, setRequestId] = useState("");
  const [items, setItems] = useState<AdminDisputeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (customerId.trim()) params.set("customerId", customerId.trim());
      if (providerId.trim()) params.set("providerId", providerId.trim());
      if (requestId.trim()) params.set("requestId", requestId.trim());

      const res = await authFetch(`/api/admin/disputes?${params}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("admin.errors.loadFailed"));
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
  }, [status, q, from, to, customerId, providerId, requestId, t]);

  useEffect(() => {
    if (pending || !allowed) return;
    void load();
  }, [pending, allowed, load]);

  if (pending || !allowed) return null;

  return (
    <AppLayout hideNav title={t("admin.disputes.title")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("admin.disputes.title")}
          subtitle={t("admin.disputes.subtitle")}
          historyBack
        />
        <AdminSectionNav activeHref="/admin/disputes" />

        <Card padding="md" className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-text-muted">
              {t("admin.disputes.filterStatus")}
              <select
                className="mt-1 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">{t("admin.disputes.statusAll")}</option>
                <option value="open">{t("admin.disputes.statusOpen")}</option>
                <option value="resolved">{t("admin.disputes.statusResolved")}</option>
                <option value="opened">{t("admin.disputes.statusOpened")}</option>
                <option value="refunded">{t("admin.disputes.statusRefunded")}</option>
                <option value="rejected">{t("admin.disputes.statusRejected")}</option>
                <option value="closed">{t("admin.disputes.statusClosed")}</option>
              </select>
            </label>
            <Input
              label={t("admin.disputes.search")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("admin.disputes.searchPlaceholder")}
            />
            <Input
              label={t("admin.disputes.filterOrderId")}
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
            />
            <Input
              label={t("admin.disputes.filterCustomerId")}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            />
            <Input
              label={t("admin.disputes.filterProviderId")}
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
            />
            <Input
              type="date"
              label={t("admin.directory.filterRegisteredFrom")}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              type="date"
              label={t("admin.directory.filterRegisteredTo")}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <Button onClick={() => void load()} loading={loading}>
            {t("admin.refresh")}
          </Button>
        </Card>

        {error && (
          <p className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</p>
        )}

        {loading ? (
          <p className="text-sm text-text-muted">{t("common.loading")}</p>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Scale}
            title={t("admin.directory.emptyDisputes")}
            description={t("admin.directory.emptyDisputesHint")}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-text-muted">
              {t("admin.disputes.count", { n: total })}
            </p>
            {items.map((item) => (
              <Card key={item.id} padding="md" className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/admin/disputes/${item.id}`}
                      className="font-semibold text-brand-700 hover:underline"
                    >
                      {item.request_title}
                    </Link>
                    <p className="mt-0.5 font-mono text-xs text-text-muted">
                      {t("admin.disputes.filterOrderId")}: {item.request_id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-text-muted">
                      {new Date(item.created_at).toLocaleString(
                        locale === "en" ? "en-US" : "ru-RU"
                      )}{" "}
                      · {t(`admin.disputes.status.${item.status}`)}
                    </p>
                  </div>
                  <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800">
                    {item.payment_status === "paid"
                      ? t("finance.paymentStatus.paid")
                      : item.payment_status === "refunded"
                        ? t("finance.paymentStatus.refunded")
                        : item.payment_status ?? "—"}
                  </span>
                </div>
                <p className="text-sm text-text-secondary">
                  {t("request.customer")}: {item.customer_name}
                </p>
                <p className="text-sm text-text-secondary">
                  {t("admin.directory.provider")}: {item.provider_name ?? "—"}
                </p>
                <p className="text-sm font-medium text-text-primary">
                  {t("admin.disputes.amount")}:{" "}
                  {item.amount_gross != null
                    ? formatPrice(item.amount_gross, item.currency)
                    : "—"}
                </p>
                <p className="line-clamp-2 whitespace-pre-wrap text-sm text-text-secondary">
                  <span className="font-semibold text-text-primary">
                    {t("request.disputeDetails.reasonLabel")}:{" "}
                  </span>
                  {item.reason}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/disputes/${item.id}`}>
                    <Button size="sm">{t("admin.disputes.open")}</Button>
                  </Link>
                  <Link href={`/requests/${item.request_id}`}>
                    <Button size="sm" variant="outline">
                      {t("admin.links.openOrder")}
                    </Button>
                  </Link>
                  {item.conversation_id && (
                    <Link href={`/admin/conversations/${item.conversation_id}`}>
                      <Button size="sm" variant="outline">
                        {t("admin.links.openChat")}
                      </Button>
                    </Link>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
