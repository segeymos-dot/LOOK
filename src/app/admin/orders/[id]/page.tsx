"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { AdminLinkRow } from "@/components/admin/AdminLinkRow";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useRequirePlatformAdmin } from "@/hooks/useRequirePlatformAdmin";
import { authFetch } from "@/lib/auth/client-fetch";
import type {
  AdminOrderDetail,
  AdminOrderMessage,
} from "@/lib/admin/order-detail";
import { cn, formatPrice } from "@/lib/utils";
import {
  ChevronDown,
  ClipboardList,
  MessageSquare,
  Scale,
  Star,
} from "lucide-react";

type SectionId =
  | "overview"
  | "parties"
  | "offers"
  | "finance"
  | "timeline"
  | "chat"
  | "reviews";

const DEFAULT_OPEN: SectionId[] = ["overview", "timeline"];

function Section({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: SectionId;
  title: string;
  open: boolean;
  onToggle: (id: SectionId) => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onToggle(id)}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-text-primary">{title}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-text-muted transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? <div className="space-y-3 border-t border-border-subtle px-4 py-3">{children}</div> : null}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <p className="text-sm text-text-secondary">
      <span className="text-text-muted">{label}: </span>
      <span className="text-text-primary">{value}</span>
    </p>
  );
}

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { t, locale } = useTranslation();
  const { pending, allowed } = useRequirePlatformAdmin();
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Set<SectionId>>(
    () => new Set(DEFAULT_OPEN)
  );

  const [messages, setMessages] = useState<AdminOrderMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [messagesTotal, setMessagesTotal] = useState(0);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/admin/orders/${params.id}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("admin.errors.loadFailed"));
        setDetail(null);
        return;
      }
      setDetail(data.detail as AdminOrderDetail);
    } catch {
      setError(t("admin.errors.loadFailed"));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [params.id, t]);

  const loadMessages = useCallback(
    async (opts?: { before?: string; append?: boolean }) => {
      setMessagesLoading(true);
      setMessagesError(null);
      try {
        const qs = new URLSearchParams({ messages: "1", limit: "50" });
        if (opts?.before) qs.set("before", opts.before);
        const res = await authFetch(`/api/admin/orders/${params.id}?${qs}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          setMessagesError(data.error ?? t("admin.errors.loadFailed"));
          return;
        }
        const page = (data.messages?.items ?? []) as AdminOrderMessage[];
        setMessagesHasMore(Boolean(data.messages?.has_more));
        setMessagesTotal(Number(data.messages?.total ?? page.length));
        setMessages((prev) => (opts?.append ? [...page, ...prev] : page));
        setMessagesLoaded(true);
      } catch {
        setMessagesError(t("admin.errors.loadFailed"));
      } finally {
        setMessagesLoading(false);
      }
    },
    [params.id, t]
  );

  useEffect(() => {
    if (pending || !allowed) return;
    void loadDetail();
  }, [pending, allowed, loadDetail]);

  const toggleSection = (id: SectionId) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (id === "chat" && !messagesLoaded && !messagesLoading) {
      void loadMessages();
    }
  };

  if (pending || !allowed) return null;

  const fmt = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(locale === "en" ? "en-US" : "ru-RU");
    } catch {
      return iso;
    }
  };

  const offerStatusLabel = (status: string) => {
    const key = `admin.orderDetail.offerStatus.${status}`;
    const label = t(key);
    return label === key ? status : label;
  };

  const timelineLabel = (type: string) => {
    const key = `admin.orderDetail.timeline.${type}`;
    const label = t(key);
    return label === key ? type : label;
  };

  return (
    <AppLayout hideNav title={detail?.order.title ?? t("admin.orderDetail.title")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={detail?.order.title ?? t("admin.orderDetail.title")}
          subtitle={t("admin.orderDetail.subtitle")}
          backHref="/admin/orders"
        />
        <AdminSectionNav activeHref="/admin/orders" />

        {loading && <p className="text-sm text-text-muted">{t("common.loading")}</p>}
        {error && <p className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</p>}

        {detail && (
          <div className="space-y-3">
            <Section
              id="overview"
              title={t("admin.orderDetail.sections.overview")}
              open={openSections.has("overview")}
              onToggle={toggleSection}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge status={detail.order.status} />
                <span className="font-mono text-xs text-text-muted">
                  {t("admin.orderDetail.shortId")}: {detail.order.id.slice(0, 8)}
                </span>
              </div>
              <Row label={t("admin.orderDetail.fullId")} value={detail.order.id} />
              <Row
                label={t("admin.directory.location")}
                value={detail.order.location ?? "—"}
              />
              <Row
                label={t("admin.orderDetail.category")}
                value={detail.order.category_name ?? "—"}
              />
              <Row label={t("admin.orderDetail.createdAt")} value={fmt(detail.order.created_at)} />
              {detail.order.description ? (
                <p className="whitespace-pre-wrap text-sm text-text-secondary">
                  {detail.order.description}
                </p>
              ) : null}
            </Section>

            <Section
              id="parties"
              title={t("admin.orderDetail.sections.parties")}
              open={openSections.has("parties")}
              onToggle={toggleSection}
            >
              <Card padding="sm" className="space-y-2">
                <p className="text-sm font-semibold text-text-primary">
                  {t("admin.orderDetail.customer")}
                </p>
                <Row label={t("admin.directory.role")} value={detail.customer.full_name ?? "—"} />
                <Row label="ID" value={detail.customer.id} />
                <Row
                  label={t("admin.directory.email")}
                  value={detail.customer.email ?? t("admin.directory.emailUnavailable")}
                />
                <Row label={t("admin.directory.phone")} value={detail.customer.phone ?? "—"} />
                <AdminLinkRow
                  links={[
                    {
                      href: `/admin/customers/${detail.customer.id}`,
                      label: t("admin.links.openCustomer"),
                    },
                  ]}
                />
              </Card>
              <Card padding="sm" className="space-y-2">
                <p className="text-sm font-semibold text-text-primary">
                  {t("admin.orderDetail.selectedProvider")}
                </p>
                {detail.selected_provider ? (
                  <>
                    <Row
                      label={t("admin.directory.provider")}
                      value={detail.selected_provider.full_name ?? "—"}
                    />
                    <Row label="ID" value={detail.selected_provider.id} />
                    <Row
                      label={t("admin.directory.email")}
                      value={
                        detail.selected_provider.email ??
                        t("admin.directory.emailUnavailable")
                      }
                    />
                    <Row
                      label={t("admin.directory.phone")}
                      value={detail.selected_provider.phone ?? "—"}
                    />
                    <AdminLinkRow
                      links={[
                        {
                          href: `/admin/providers/${detail.selected_provider.id}`,
                          label: t("admin.links.openProvider"),
                        },
                      ]}
                    />
                  </>
                ) : (
                  <p className="text-sm text-text-muted">{t("admin.orderDetail.noProvider")}</p>
                )}
              </Card>
            </Section>

            <Section
              id="offers"
              title={`${t("admin.orderDetail.sections.offers")} (${detail.offers.length})`}
              open={openSections.has("offers")}
              onToggle={toggleSection}
            >
              {detail.offers.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title={t("admin.orderDetail.emptyOffers")}
                />
              ) : (
                detail.offers.map((offer) => (
                  <Card
                    key={offer.id}
                    padding="sm"
                    className={cn(
                      "space-y-1",
                      offer.selected && "ring-2 ring-brand-500/40"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-text-primary">
                        {offer.provider_name ?? "—"}
                      </p>
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text-secondary">
                        {offerStatusLabel(offer.status)}
                      </span>
                    </div>
                    {offer.selected ? (
                      <p className="text-xs font-semibold text-brand-700">
                        {t("admin.orderDetail.selectedOffer")}
                      </p>
                    ) : null}
                    <Row
                      label={t("admin.orderDetail.offerAmount")}
                      value={formatPrice(offer.price, offer.currency)}
                    />
                    <Row label={t("admin.orderDetail.createdAt")} value={fmt(offer.created_at)} />
                    {offer.message ? (
                      <p className="whitespace-pre-wrap text-sm text-text-secondary">
                        {offer.message}
                      </p>
                    ) : null}
                    <AdminLinkRow
                      links={[
                        {
                          href: `/admin/providers/${offer.provider_id}`,
                          label: t("admin.links.openProvider"),
                        },
                      ]}
                    />
                  </Card>
                ))
              )}
            </Section>

            <Section
              id="finance"
              title={t("admin.orderDetail.sections.finance")}
              open={openSections.has("finance")}
              onToggle={toggleSection}
            >
              <Row
                label={t("admin.orderDetail.orderAmount")}
                value={
                  detail.finance.order_amount != null
                    ? formatPrice(detail.finance.order_amount, detail.finance.currency)
                    : "—"
                }
              />
              <Row
                label={t("admin.orderDetail.commissionRate")}
                value={
                  detail.finance.commission_rate != null
                    ? `${(detail.finance.commission_rate * 100).toFixed(2)}%`
                    : "—"
                }
              />
              <Row
                label={t("admin.orderDetail.commissionAmount")}
                value={
                  detail.finance.commission_amount != null
                    ? formatPrice(detail.finance.commission_amount, detail.finance.currency)
                    : "—"
                }
              />
              <Row
                label={t("admin.orderDetail.providerNet")}
                value={
                  detail.finance.provider_net != null
                    ? formatPrice(detail.finance.provider_net, detail.finance.currency)
                    : "—"
                }
              />
              <Row
                label={t("admin.orderDetail.paymentStatus")}
                value={detail.finance.order_payment_status ?? detail.finance.payment?.status ?? "—"}
              />
              <Row label={t("admin.orderDetail.paidAt")} value={fmt(detail.finance.paid_at)} />
              <Row
                label={t("admin.orderDetail.payoutStatus")}
                value={detail.finance.payout_status ?? "—"}
              />
              {(detail.finance.refunded_at ||
                detail.finance.refund_amount != null ||
                detail.finance.cancellation_reason) && (
                <>
                  <Row
                    label={t("admin.orderDetail.refundAmount")}
                    value={
                      detail.finance.refund_amount != null
                        ? formatPrice(detail.finance.refund_amount, detail.finance.currency)
                        : "—"
                    }
                  />
                  <Row
                    label={t("admin.orderDetail.refundReason")}
                    value={detail.finance.refund_reason ?? "—"}
                  />
                  <Row
                    label={t("admin.orderDetail.refundedAt")}
                    value={fmt(detail.finance.refunded_at)}
                  />
                  <Row
                    label={t("admin.orderDetail.cancelReason")}
                    value={detail.finance.cancellation_reason ?? "—"}
                  />
                </>
              )}
            </Section>

            <Section
              id="timeline"
              title={t("admin.orderDetail.sections.timeline")}
              open={openSections.has("timeline")}
              onToggle={toggleSection}
            >
              {detail.timeline.length === 0 ? (
                <p className="text-sm text-text-muted">{t("admin.directory.emptyTimeline")}</p>
              ) : (
                <ol className="space-y-3">
                  {detail.timeline.map((event) => (
                    <li key={event.id} className="border-l-2 border-brand-200 pl-3">
                      <p className="text-sm font-semibold text-text-primary">
                        {timelineLabel(event.type)}
                      </p>
                      <p className="text-xs text-text-muted">{fmt(event.at)}</p>
                      <p className="text-xs text-text-secondary">
                        {event.actor_name ?? event.actor_role ?? "—"}
                        {event.meta?.amount != null
                          ? ` · ${formatPrice(Number(event.meta.amount), detail.finance.currency)}`
                          : ""}
                        {event.meta?.rating != null ? ` · ★ ${event.meta.rating}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            <Section
              id="chat"
              title={`${t("admin.orderDetail.sections.chat")}${
                detail.message_count ? ` (${detail.message_count})` : ""
              }`}
              open={openSections.has("chat")}
              onToggle={toggleSection}
            >
              <p className="text-xs text-text-muted">{t("admin.orderDetail.chatReadOnly")}</p>
              {!detail.conversation_id ? (
                <EmptyState
                  icon={MessageSquare}
                  title={t("admin.directory.emptyConversations")}
                  description={t("admin.orderDetail.emptyChatHint")}
                />
              ) : (
                <>
                  {messagesError && (
                    <p className="text-sm text-danger">{messagesError}</p>
                  )}
                  {messagesLoading && !messagesLoaded && (
                    <p className="text-sm text-text-muted">{t("common.loading")}</p>
                  )}
                  {messagesLoaded && messages.length === 0 ? (
                    <EmptyState
                      icon={MessageSquare}
                      title={t("admin.directory.emptyConversations")}
                    />
                  ) : null}
                  {messages.length > 0 ? (
                    <div className="space-y-2">
                      {messagesHasMore ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-[44px]"
                          loading={messagesLoading}
                          onClick={() =>
                            void loadMessages({
                              before: messages[0]?.created_at,
                              append: true,
                            })
                          }
                        >
                          {t("admin.orderDetail.loadOlder")}
                        </Button>
                      ) : null}
                      <p className="text-xs text-text-muted">
                        {t("admin.orderDetail.messagesShown", {
                          n: messages.length,
                          total: messagesTotal,
                        })}
                      </p>
                      {messages.map((m) => (
                        <Card key={m.id} padding="sm" className="space-y-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-sm font-semibold text-text-primary">
                              {m.sender_role === "system"
                                ? t("admin.orderDetail.systemSender")
                                : m.sender_name ?? "—"}
                              <span className="ml-2 text-xs font-normal text-text-muted">
                                {m.sender_role}
                              </span>
                            </p>
                            <p className="text-xs text-text-muted">{fmt(m.created_at)}</p>
                          </div>
                          <p className="whitespace-pre-wrap text-sm text-text-secondary">
                            {m.content}
                          </p>
                          {m.attachment_urls.length > 0 ? (
                            <ul className="space-y-1">
                              {m.attachment_urls.map((a) => (
                                <li key={a.url}>
                                  <a
                                    href={a.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs font-medium text-brand-600 hover:underline"
                                  >
                                    {a.name || a.url}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </Card>
                      ))}
                    </div>
                  ) : null}
                  {detail.conversation_id ? (
                    <Link
                      href={`/admin/conversations/${detail.conversation_id}`}
                      className="inline-flex min-h-[44px] items-center text-sm font-medium text-brand-600"
                    >
                      {t("admin.links.openConversation")}
                    </Link>
                  ) : null}
                </>
              )}
            </Section>

            <Section
              id="reviews"
              title={t("admin.orderDetail.sections.reviewsDisputes")}
              open={openSections.has("reviews")}
              onToggle={toggleSection}
            >
              {detail.reviews.length === 0 ? (
                <EmptyState icon={Star} title={t("admin.orderDetail.emptyReviews")} />
              ) : (
                detail.reviews.map((review) => (
                  <Card key={review.id} padding="sm" className="space-y-1">
                    <p className="text-sm font-semibold text-text-primary">
                      {review.direction === "customer_to_provider"
                        ? t("admin.orderDetail.reviewCustomerToProvider")
                        : review.direction === "provider_to_customer"
                          ? t("admin.orderDetail.reviewProviderToCustomer")
                          : t("admin.record.reviews")}
                      {" · ★ "}
                      {review.rating}
                    </p>
                    <p className="text-xs text-text-muted">{fmt(review.created_at)}</p>
                    <p className="text-sm text-text-secondary">
                      {review.reviewer_name ?? "—"} → {review.reviewee_name ?? "—"}
                    </p>
                    {review.comment ? (
                      <p className="whitespace-pre-wrap text-sm text-text-secondary">
                        {review.comment}
                      </p>
                    ) : null}
                  </Card>
                ))
              )}

              <Card padding="sm" className="space-y-2">
                <p className="text-sm font-semibold text-text-primary">
                  {t("admin.record.disputes")}
                </p>
                {detail.dispute ? (
                  <>
                    <Row
                      label={t("admin.disputes.statusLabel")}
                      value={detail.dispute.status}
                    />
                    <Row
                      label={t("request.disputeDetails.reasonLabel")}
                      value={detail.dispute.reason || "—"}
                    />
                    <Row
                      label={t("admin.orderDetail.createdAt")}
                      value={fmt(detail.dispute.created_at)}
                    />
                    {detail.dispute.resolution_decision ? (
                      <Row
                        label={t("admin.disputes.decisionLabel")}
                        value={detail.dispute.resolution_decision}
                      />
                    ) : null}
                    <AdminLinkRow
                      links={[
                        {
                          href: `/admin/disputes/${detail.dispute.id}`,
                          label: t("admin.links.openDispute"),
                        },
                      ]}
                    />
                  </>
                ) : (
                  <EmptyState icon={Scale} title={t("admin.directory.emptyDisputes")} />
                )}
              </Card>
            </Section>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
