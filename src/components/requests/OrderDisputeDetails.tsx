"use client";

import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import { getRoleLabelT } from "@/lib/i18n/client-messages";
import { isResolvedDispute } from "@/lib/data/order-disputes";
import { formatPrice } from "@/lib/utils";
import type {
  DisputeResolutionDecision,
  OrderDispute,
  OrderPaymentStatus,
  RefundDisputeStatus,
} from "@/types";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

export type OrderDisputeDetailsProps = {
  requestId: string;
  refundDisputeStatus?: RefundDisputeStatus | null;
  orderPaymentStatus?: OrderPaymentStatus | null;
  currency?: string | null;
  /** Server-loaded dispute; when omitted and a dispute may exist, fetches from API. */
  initialDispute?: OrderDispute | null;
  /**
   * Fallback reason from requests.refund_reason / cancellation_reason when the
   * dispute row cannot be loaded. Still shown as Dispute reason (not revision).
   */
  fallbackReason?: string | null;
  className?: string;
};

function formatOpenedAt(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale === "en" ? "en-US" : "ru-RU", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function isSystemReasonCode(reason: string): boolean {
  return /^[a-z][a-z0-9_]*$/i.test(reason.trim());
}

function numFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function maybeHasDisputeRow(
  refundDisputeStatus: RefundDisputeStatus | null | undefined,
  initialDispute: OrderDispute | null | undefined
): boolean {
  return (
    Boolean(initialDispute) ||
    refundDisputeStatus === "dispute_opened" ||
    refundDisputeStatus === "refunded" ||
    refundDisputeStatus === "refund_rejected"
  );
}

function finalPaymentStatusKey(
  dispute: OrderDispute,
  orderPaymentStatus: OrderPaymentStatus | null | undefined
): "refunded" | "paid_out" | "paid" {
  const afterPay =
    typeof dispute.amounts_after?.order_payment_status === "string"
      ? dispute.amounts_after.order_payment_status
      : null;
  const effective = String(orderPaymentStatus ?? afterPay ?? "");

  if (effective === "refunded" || dispute.resolution_decision === "full_refund_customer") {
    return "refunded";
  }
  if (
    effective === "completed" ||
    dispute.resolution_decision === "release_full_payout" ||
    dispute.resolution_decision === "reject" ||
    dispute.status === "rejected" ||
    dispute.status === "closed"
  ) {
    return "paid_out";
  }
  // Partial / split with a refund while payment was not fully reversed.
  if ((dispute.customer_refund_amount ?? 0) > 0 && effective !== "completed") {
    return "refunded";
  }
  if (effective === "paid") return "paid";
  return "refunded";
}

function settlementRows(
  dispute: OrderDispute
): Array<{ key: string; amount: number }> {
  const beforeProvider = numFromUnknown(dispute.amounts_before?.provider_amount) ?? 0;
  const beforeFee = numFromUnknown(dispute.amounts_before?.platform_fee) ?? 0;
  const customerRefund = dispute.customer_refund_amount ?? 0;
  const providerRelease = dispute.provider_release_amount ?? 0;
  const feeRetained = dispute.platform_fee_retained ?? 0;
  const providerReversed = Math.max(0, beforeProvider - providerRelease);
  const feeReversed = Math.max(0, beforeFee - feeRetained);

  return [
    { key: "customerRefund", amount: customerRefund },
    { key: "providerRetained", amount: providerRelease },
    { key: "providerReversed", amount: providerReversed },
    { key: "commissionRetained", amount: feeRetained },
    { key: "commissionReversed", amount: feeReversed },
  ];
}

export function OrderDisputeDetails({
  requestId,
  refundDisputeStatus = "none",
  orderPaymentStatus = null,
  currency = null,
  initialDispute = null,
  fallbackReason = null,
  className,
}: OrderDisputeDetailsProps) {
  const { t, locale } = useTranslation();
  const [dispute, setDispute] = useState<OrderDispute | null>(initialDispute);
  const [fetchedFallback, setFetchedFallback] = useState<string | null>(null);
  const [fetchedCurrency, setFetchedCurrency] = useState<string | null>(null);
  const [fetchedPaymentStatus, setFetchedPaymentStatus] =
    useState<OrderPaymentStatus | null>(null);
  const shouldLoad = maybeHasDisputeRow(refundDisputeStatus, initialDispute);
  const [loading, setLoading] = useState(shouldLoad && !initialDispute);
  const effectiveFallback = fetchedFallback ?? fallbackReason;
  const displayCurrency = currency ?? fetchedCurrency ?? "EUR";
  const displayPaymentStatus = orderPaymentStatus ?? fetchedPaymentStatus;

  useEffect(() => {
    setDispute(initialDispute);
  }, [initialDispute]);

  useEffect(() => {
    if (!shouldLoad) {
      setDispute(null);
      setFetchedFallback(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    // Prefer fresh API data after refresh / resolve; keep SSR row while loading.
    if (!initialDispute) setLoading(true);

    void authFetch(`/api/requests/${requestId}/dispute`)
      .then((r) => r.json())
      .then(
        (data: {
          dispute?: OrderDispute | null;
          disputeFallbackReason?: string | null;
          currency?: string | null;
          orderPaymentStatus?: OrderPaymentStatus | null;
        }) => {
          if (!cancelled) {
            setDispute(data.dispute ?? null);
            if (data.disputeFallbackReason) {
              setFetchedFallback(data.disputeFallbackReason);
            }
            if (data.currency) setFetchedCurrency(data.currency);
            if (data.orderPaymentStatus) {
              setFetchedPaymentStatus(data.orderPaymentStatus);
            }
          }
        }
      )
      .catch(() => {
        if (!cancelled && !initialDispute) setDispute(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [requestId, refundDisputeStatus, initialDispute, shouldLoad]);

  const resolved = isResolvedDispute(dispute);
  const open =
    refundDisputeStatus === "dispute_opened" ||
    (!resolved && (dispute?.status === "opened" || Boolean(dispute)));

  if (!open && !resolved && !loading) return null;
  if (!dispute && !effectiveFallback && !loading) return null;

  // Cancel-with-refund (no dispute row): do not render a dispute block.
  if (
    !loading &&
    !dispute &&
    refundDisputeStatus !== "dispute_opened" &&
    !initialDispute
  ) {
    return null;
  }

  if (loading && !dispute && !effectiveFallback) {
    return (
      <Card padding="md" className={className}>
        <p className="text-sm text-text-muted">{t("common.loading")}</p>
      </Card>
    );
  }

  const reasonRaw = (dispute?.reason ?? effectiveFallback ?? "").trim();
  const reason =
    reasonRaw && !isSystemReasonCode(reasonRaw)
      ? reasonRaw
      : reasonRaw || t("request.disputeDetails.reasonUnavailable");

  if (resolved && dispute) {
    const decision = dispute.resolution_decision as DisputeResolutionDecision | null;
    const resolverName =
      dispute.resolver?.full_name?.trim() ||
      t("request.disputeDetails.unknownResolver");
    const resolverRole = dispute.resolver?.is_platform_admin
      ? t("role.admin")
      : dispute.resolver?.role
        ? getRoleLabelT(dispute.resolver.role, t)
        : t("role.admin");
    const resolvedWhen = dispute.resolved_at
      ? formatOpenedAt(dispute.resolved_at, locale)
      : null;
    const paymentKey = finalPaymentStatusKey(dispute, displayPaymentStatus);
    const rows = settlementRows(dispute);

    return (
      <Card
        padding="md"
        className={`border-emerald-200 bg-emerald-50/70 ${className ?? ""}`}
      >
        <div className="mb-3 flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">
              {t("request.disputeDetails.resolvedTitle")}
            </p>
            <p className="mt-1 text-xs text-emerald-800">
              {resolvedWhen
                ? t("request.disputeDetails.resolvedByRole", {
                    name: resolverName,
                    role: resolverRole,
                    when: resolvedWhen,
                  })
                : t("request.disputeDetails.resolvedBy", {
                    name: resolverName,
                    role: resolverRole,
                  })}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-200 bg-surface px-3 py-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t("request.disputeDetails.decisionLabel")}
            </p>
            <p className="text-sm text-text-primary">
              {decision
                ? t(`admin.disputes.decisions.${decision}`)
                : t("request.disputeDetails.decisionUnavailable")}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-surface px-3 py-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t("request.disputeDetails.resolutionNoteLabel")}
            </p>
            <p className="whitespace-pre-wrap text-sm text-text-primary">
              {dispute.resolution_note?.trim() ||
                t("request.disputeDetails.resolutionNoteUnavailable")}
            </p>
            <p className="mt-2 text-xs text-text-muted">
              {t("request.disputeDetails.resolutionNoteImmutable")}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-surface px-3 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t("request.disputeDetails.settlementLabel")}
            </p>
            <ul className="space-y-1 text-sm text-text-primary">
              {rows.map((row) => (
                <li key={row.key} className="flex justify-between gap-3">
                  <span className="text-text-secondary">
                    {t(`request.disputeDetails.settlement.${row.key}`)}
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatPrice(row.amount, displayCurrency)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              <span className="text-text-muted">
                {t("request.disputeDetails.finalPaymentStatus")}:{" "}
              </span>
              <span className="font-semibold text-text-primary">
                {t(`request.disputeDetails.paymentStatus.${paymentKey}`)}
              </span>
            </p>
          </div>

          <div className="rounded-xl border border-border-subtle bg-surface px-3 py-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t("request.disputeDetails.reasonLabel")}
            </p>
            <p className="whitespace-pre-wrap text-sm text-text-primary">{reason}</p>
            <p className="mt-2 text-xs text-text-muted">
              {t("request.disputeDetails.reasonImmutable")}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const openerName =
    dispute?.opener?.full_name?.trim() || t("request.disputeDetails.unknownOpener");
  const openerRole = dispute?.opener?.role
    ? getRoleLabelT(dispute.opener.role, t)
    : null;
  const openedWhen = dispute?.created_at
    ? formatOpenedAt(dispute.created_at, locale)
    : null;

  return (
    <Card
      padding="md"
      className={`border-orange-200 bg-orange-50/70 ${className ?? ""}`}
    >
      <div className="mb-3 flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" />
        <div>
          <p className="text-sm font-semibold text-orange-900">
            {t("request.disputeDetails.title")}
          </p>
          <p className="mt-1 text-xs text-orange-800">
            {openerRole && openedWhen
              ? t("request.disputeDetails.openedByRole", {
                  name: openerName,
                  role: openerRole,
                  when: openedWhen,
                })
              : openedWhen
                ? t("request.disputeDetails.openedBy", {
                    name: openerName,
                    when: openedWhen,
                  })
                : t("request.disputeDetails.openStatusOnly")}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-orange-200 bg-surface px-3 py-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
          {t("request.disputeDetails.reasonLabel")}
        </p>
        <p className="whitespace-pre-wrap text-sm text-text-primary">{reason}</p>
        <p className="mt-2 text-xs text-text-muted">
          {t("request.disputeDetails.reasonImmutable")}
        </p>
      </div>

      <p className="mt-3 text-xs text-orange-900/80">
        {t("request.disputeDetails.paymentStaysPaid")}
      </p>
    </Card>
  );
}
