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
import type { AdminProviderRecord } from "@/lib/admin/directory";
import { formatPrice } from "@/lib/utils";
import {
  Briefcase,
  ClipboardList,
  MessageSquare,
  Receipt,
  Star,
  TimerReset,
} from "lucide-react";

export default function AdminProviderRecordPage() {
  const params = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { pending, allowed } = useRequirePlatformAdmin();
  const [record, setRecord] = useState<AdminProviderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pending || !allowed) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await authFetch(`/api/admin/providers/${params.id}`);
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
              label={t("admin.directory.categories")}
              value={o.provider_category_slugs.join(", ") || "—"}
            />
            <Row
              label={t("admin.directory.rating")}
              value={`${o.rating.toFixed(1)} (${o.reviews_count})`}
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
            <Row
              label={t("admin.directory.phoneVerified")}
              value={o.phone_verified ? t("admin.directory.yes") : t("admin.directory.no")}
            />
            <Row
              label={t("admin.directory.profileComplete")}
              value={
                o.profile_complete == null
                  ? "—"
                  : o.profile_complete
                    ? t("admin.directory.yes")
                    : t("admin.directory.no")
              }
            />
            <Row
              label={t("admin.directory.totalEarned")}
              value={
                o.total_earned != null
                  ? formatPrice(o.total_earned, o.balance_currency ?? "USD")
                  : "—"
              }
            />
            <Row
              label={t("admin.directory.availableBalance")}
              value={
                o.available_balance != null
                  ? formatPrice(o.available_balance, o.balance_currency ?? "USD")
                  : "—"
              }
            />
          </Card>
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
                    {offer.customer_name ?? "—"} · {formatPrice(offer.price, offer.currency)} ·{" "}
                    {offer.status}
                  </p>
                  {offer.message && (
                    <p className="text-xs text-text-muted line-clamp-3">{offer.message}</p>
                  )}
                  <AdminLinkRow
                    links={[
                      {
                        href: `/requests/${offer.request_id}`,
                        label: t("admin.links.openOrder"),
                      },
                      ...(offer.customer_id
                        ? [
                            {
                              href: `/admin/customers/${offer.customer_id}`,
                              label: t("admin.links.openCustomer"),
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
        id: "jobs",
        label: t("admin.record.jobs"),
        content:
          record.jobs.length === 0 ? (
            <EmptyState icon={Briefcase} title={t("admin.directory.emptyOrders")} />
          ) : (
            <div className="space-y-3">
              {record.jobs.map((job) => (
                <Card key={job.request_id} padding="md" className="space-y-1 text-sm">
                  <p className="font-semibold text-text-primary">{job.title}</p>
                  <p className="text-text-secondary">
                    {job.status} · {job.customer_name ?? "—"} ·{" "}
                    {job.agreed_amount != null
                      ? formatPrice(job.agreed_amount, job.currency)
                      : "—"}
                  </p>
                  <AdminLinkRow
                    links={[
                      {
                        href: `/requests/${job.request_id}`,
                        label: t("admin.links.openOrder"),
                      },
                      {
                        href: `/admin/customers/${job.customer_id}`,
                        label: t("admin.links.openCustomer"),
                      },
                    ]}
                  />
                </Card>
              ))}
            </div>
          ),
      },
      {
        id: "work",
        label: t("admin.record.workSubmissions"),
        content:
          record.work_submissions.length === 0 ? (
            <EmptyState icon={ClipboardList} title={t("admin.directory.emptyWork")} />
          ) : (
            <div className="space-y-3">
              {record.work_submissions.map((s) => (
                <Card key={s.id} padding="md" className="space-y-1 text-sm">
                  <p className="font-semibold text-text-primary">
                    {s.request_title ?? s.request_id}
                  </p>
                  <p className="text-text-secondary line-clamp-4">{s.summary || "—"}</p>
                  <p className="text-xs text-text-muted">
                    rev {s.revision_number} · attachments: {s.attachment_count} ·{" "}
                    {s.request_status ?? "—"}
                  </p>
                  <AdminLinkRow
                    links={[
                      {
                        href: `/requests/${s.request_id}`,
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
                    {c.customer_name ?? "—"} · {c.message_count} {t("admin.directory.messages")}
                  </p>
                  <AdminLinkRow
                    links={[
                      { href: `/admin/conversations/${c.id}`, label: t("admin.links.openConversation") },
                      {
                        href: `/admin/customers/${c.customer_id}`,
                        label: t("admin.links.openCustomer"),
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
        label: t("admin.record.earnings"),
        content: (
          <div className="space-y-3">
            {record.payments.length === 0 ? (
              <EmptyState icon={Receipt} title={t("admin.directory.emptyPayments")} />
            ) : (
              record.payments.map((p) => (
                <Card key={p.id} padding="md" className="space-y-1 text-sm">
                  <p className="font-semibold text-text-primary">
                    {formatPrice(p.provider_amount, p.currency)} · {p.status}
                  </p>
                  <p className="text-xs text-text-muted">
                    gross {formatPrice(p.amount_gross, p.currency)} · fee{" "}
                    {formatPrice(p.platform_fee, p.currency)}
                  </p>
                  <AdminLinkRow
                    links={[
                      {
                        href: `/requests/${p.request_id}/payment`,
                        label: t("admin.links.openPayment"),
                      },
                    ]}
                  />
                </Card>
              ))
            )}
            {record.payouts.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-text-primary">
                  {t("admin.record.payouts")}
                </p>
                {record.payouts.map((p) => (
                  <Card key={p.id} padding="md" className="text-sm">
                    {formatPrice(p.amount, p.currency)} · {p.status}
                  </Card>
                ))}
              </div>
            )}
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
                    ★ {r.rating} · {r.reviewer_name ?? "—"}
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
                <Card key={event.id} padding="md" className="text-sm">
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
      title={t("admin.providers.recordTitle")}
      activeNavHref="/admin/providers"
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
