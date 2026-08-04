"use client";

import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import { getRoleLabelT } from "@/lib/i18n/client-messages";
import type { OrderDispute, RefundDisputeStatus } from "@/types";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

export type OrderDisputeDetailsProps = {
  requestId: string;
  refundDisputeStatus?: RefundDisputeStatus | null;
  /** Server-loaded dispute; when omitted and status is open, fetches from API. */
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

export function OrderDisputeDetails({
  requestId,
  refundDisputeStatus = "none",
  initialDispute = null,
  fallbackReason = null,
  className,
}: OrderDisputeDetailsProps) {
  const { t, locale } = useTranslation();
  const [dispute, setDispute] = useState<OrderDispute | null>(initialDispute);
  const [fetchedFallback, setFetchedFallback] = useState<string | null>(null);
  const needsFetch =
    !initialDispute && refundDisputeStatus === "dispute_opened";
  const [loading, setLoading] = useState(needsFetch);
  const effectiveFallback = fetchedFallback ?? fallbackReason;

  useEffect(() => {
    setDispute(initialDispute);
  }, [initialDispute]);

  useEffect(() => {
    if (initialDispute) {
      setLoading(false);
      return;
    }
    if (refundDisputeStatus !== "dispute_opened") {
      setDispute(null);
      setFetchedFallback(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void authFetch(`/api/requests/${requestId}/dispute`)
      .then((r) => r.json())
      .then(
        (data: {
          dispute?: OrderDispute | null;
          disputeFallbackReason?: string | null;
        }) => {
          if (!cancelled) {
            setDispute(data.dispute ?? null);
            if (data.disputeFallbackReason) {
              setFetchedFallback(data.disputeFallbackReason);
            }
          }
        }
      )
      .catch(() => {
        if (!cancelled) setDispute(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [requestId, refundDisputeStatus, initialDispute]);

  const active =
    refundDisputeStatus === "dispute_opened" ||
    dispute?.status === "opened" ||
    Boolean(dispute);

  if (!active && !loading) return null;

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
