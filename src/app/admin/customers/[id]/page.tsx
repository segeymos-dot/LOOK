"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AdminRecordShell } from "@/components/admin/AdminRecordShell";
import { AdminLinkRow } from "@/components/admin/AdminLinkRow";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useRequirePlatformAdmin } from "@/hooks/useRequirePlatformAdmin";
import { authFetch } from "@/lib/auth/client-fetch";
import type { AdminCustomerRecord } from "@/lib/admin/directory";
import { formatPrice } from "@/lib/utils";
import { ClipboardList, MessageSquare, Receipt, Star, TimerReset } from "lucide-react";

export default function AdminCustomerRecordPage() {
  const params = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { pending, allowed } = useRequirePlatformAdmin();
  const [record, setRecord] = useState<AdminCustomerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pending || !allowed) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await authFetch(`/api/admin/customers/${params.id}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(t("admin.errors.loadFailed"));
          setRecord(null);
          return;
        }
        setRecord(data.record);
      } catch {
        setError(t("admin.errors.loadFailed"));
        setRecord(null);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [pending, allowed, params.id, t]);

  const tabs = useMemo(() => {
    if (!record) return [];
    const o = record.overview;

    return [
      {
        id: "overview",
        label: t("admin.record.overview"),
        content: (
          <Card padding="md" className="space-y-2 text-sm text-text-secondary">
            <Row label={t("admin.directory.role")} value={o.role} />
            <Row label={t("admin.directory.email")} value={o.email ?? t("admin.directory.emailUnavailable")} />
            <Row label={t("admin.directory.phone")} value={o.phone ?? "—"} />
            <Row
              label={t("admin.directory.location")}
              value={[o.city, o.country].filter(Boolean).join(", ") || "—"}
            />
            <Row
              label={t("admin.directory.registered")}
              value={new Date(o.created_at).toLocaleString()}
            />
            <Row
              label={t("admin.directory.lastActivity")}
              value={new Date(o.last_activity_at).toLocaleString()}
            />
            <Row label={t("admin.directory.status")} value={t("admin.directory.statusActive")} />
            <Row
              label={t("admin.directory.emailVerified")}
              value={
                o.email_verified == null
                  ? "—"
                  : o.email_verified
                    ? t("admin.directory.yes")
                    : t("admin.directory.no")
              }
            />
          </Card>
        ),
      },
      {
        id: "orders",
        label: t("admin.record.orders"),
        content:
          record.orders.length === 0 ? (
            <EmptyState icon={ClipboardList} title={t("admin.directory.emptyOrders")} />
          ) : (
            <div className="space-y-3">
              {record.orders.map((order) => (
                <Card key={order.id} padding="md" className="space-y-1 text-sm">
                  <p className="font-semibold text-text-primary">{order.title}</p>
                  <p className="text-text-secondary">
                    {order.status} · {order.order_payment_status ?? "—"} ·{" "}
                    {order.category_name ?? "—"}
                  </p>
                  <p className="text-xs text-text-muted">
                    {t("admin.directory.budget")}:{" "}
                    {order.order_amount != null
                      ? formatPrice(order.order_amount, order.currency)
                      : `${order.budget_min ?? "—"}–${order.budget_max ?? "—"} ${order.currency}`}
                  </p>
                  <p className="text-xs text-text-muted">
                    {t("admin.directory.provider")}: {order.selected_provider_name ?? "—"}
                  </p>
                  <AdminLinkRow
                    links={[
                      { href: `/requests/${order.id}`, label: t("admin.links.openOrder") },
                      ...(order.selected_provider_id
                        ? [
                            {
                              href: `/admin/providers/${order.selected_provider_id}`,
                              label: t("admin.links.openProvider"),
                            },
                          ]
                        : []),
                    ]}
                  />
                </Card>
              ))}
            </div>
          ),
      },
      {
        id: "offers",
        label: t("admin.record.offers"),
        content:
          record.offers.length === 0 ? (
            <EmptyState icon={ClipboardList} title={t("admin.directory.emptyOffers")} />
          ) : (
            <div className="space-y-3">
              {record.offers.map((offer) => (
                <Card key={offer.id} padding="md" className="space-y-1 text-sm">
                  <p className="font-semibold text-text-primary">
                    {offer.request_title ?? offer.request_id}
                  </p>
                  <p className="text-text-secondary">
                    {offer.provider_name ?? "—"} · {formatPrice(offer.price, offer.currency)} ·{" "}
                    {offer.status}
                  </p>
                  <AdminLinkRow
                    links={[
                      {
                        href: `/requests/${offer.request_id}`,
                        label: t("admin.links.openOrder"),
                      },
                      {
                        href: `/admin/providers/${offer.provider_id}`,
                        label: t("admin.links.openProvider"),
                      },
                    ]}
                  />
                </Card>
              ))}
            </div>
          ),
      },
      {
        id: "conversations",
        label: t("admin.record.conversations"),
        content:
          record.conversations.length === 0 ? (
            <EmptyState icon={MessageSquare} title={t("admin.directory.emptyConversations")} />
          ) : (
            <div className="space-y-3">
              {record.conversations.map((c) => (
                <Card key={c.id} padding="md" className="space-y-1 text-sm">
                  <p className="font-semibold text-text-primary">
                    {c.request_title ?? c.request_id}
                  </p>
                  <p className="text-text-secondary">
                    {c.provider_name ?? "—"} · {c.message_count} {t("admin.directory.messages")}
                  </p>
                  <AdminLinkRow
                    links={[
                      { href: `/admin/conversations/${c.id}`, label: t("admin.links.openConversation") },
                      {
                        href: `/admin/providers/${c.provider_id}`,
                        label: t("admin.links.openProvider"),
                      },
                      {
                        href: `/requests/${c.request_id}`,
                        label: t("admin.links.openOrder"),
                      },
                    ]}
                  />
                </Card>
              ))}
            </div>
          ),
      },
      {
        id: "payments",
        label: t("admin.record.payments"),
        content:
          record.payments.length === 0 ? (
            <EmptyState icon={Receipt} title={t("admin.directory.emptyPayments")} />
          ) : (
            <div className="space-y-3">
              {record.payments.map((p) => (
                <Card key={p.id} padding="md" className="space-y-1 text-sm">
                  <p className="font-semibold text-text-primary">
                    {formatPrice(p.amount_gross, p.currency)} · {p.status}
                  </p>
                  <p className="text-xs text-text-muted">
                    {t("admin.directory.commission")}:{" "}
                    {formatPrice(p.platform_fee, p.currency)} ·{" "}
                    {t("admin.directory.providerAmount")}:{" "}
                    {formatPrice(p.provider_amount, p.currency)}
                  </p>
                  <p className="text-xs text-text-muted">
                    ref: {p.external_reference_prefix ?? "—"}
                  </p>
                  <AdminLinkRow
                    links={[
                      {
                        href: `/requests/${p.request_id}/payment`,
                        label: t("admin.links.openPayment"),
                      },
                      {
                        href: `/requests/${p.request_id}`,
                        label: t("admin.links.openOrder"),
                      },
                    ]}
                  />
                </Card>
              ))}
            </div>
          ),
      },
      {
        id: "reviews",
        label: t("admin.record.reviews"),
        content:
          record.reviews.length === 0 ? (
            <EmptyState icon={Star} title={t("review.empty")} />
          ) : (
            <div className="space-y-3">
              {record.reviews.map((r) => (
                <Card key={r.id} padding="md" className="space-y-1 text-sm">
                  <p className="font-semibold text-text-primary">
                    ★ {r.rating} · {r.reviewee_name ?? "—"}
                  </p>
                  <p className="text-text-secondary">{r.comment || "—"}</p>
                  {r.request_id && (
                    <AdminLinkRow
                      links={[
                        {
                          href: `/requests/${r.request_id}`,
                          label: t("admin.links.openOrder"),
                        },
                      ]}
                    />
                  )}
                </Card>
              ))}
            </div>
          ),
      },
      {
        id: "disputes",
        label: t("admin.record.disputes"),
        content: (
          <EmptyState
            icon={ClipboardList}
            title={t("admin.directory.emptyDisputes")}
            description={t("admin.directory.noDisputeModel")}
          />
        ),
      },
      {
        id: "timeline",
        label: t("admin.record.timeline"),
        content:
          record.timeline.length === 0 ? (
            <EmptyState icon={TimerReset} title={t("admin.directory.emptyTimeline")} />
          ) : (
            <div className="space-y-2">
              {record.timeline.map((event) => (
                <Card key={event.id} padding="sm" className="text-sm">
                  <p className="text-xs text-text-muted">
                    {new Date(event.at).toLocaleString()} · {event.kind}
                  </p>
                  <p className="font-medium text-text-primary">{event.label}</p>
                  {event.href && (
                    <AdminLinkRow
                      links={[{ href: event.href, label: t("admin.links.openOrder") }]}
                    />
                  )}
                </Card>
              ))}
            </div>
          ),
      },
    ];
  }, [record, t]);

  if (pending || !allowed) return null;

  return (
    <AdminRecordShell
      title={t("admin.customers.recordTitle")}
      backHref="/admin/customers"
      activeNavHref="/admin/customers"
      overview={record?.overview ?? null}
      tabs={tabs}
      loading={loading}
      error={error}
    />
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-border-subtle/60 py-1.5 last:border-0">
      <span className="text-text-muted">{label}</span>
      <span className="text-right text-text-primary">{value}</span>
    </div>
  );
}
