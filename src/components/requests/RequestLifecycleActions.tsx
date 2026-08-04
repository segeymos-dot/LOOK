"use client";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { OrderFinanceStatusBadge } from "@/components/finance/OrderFinanceStatusBadge";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { mockCurrentUser } from "@/lib/mock/data";
import { isRequestOwner as checkRequestOwner } from "@/lib/auth/viewer-role";
import { previewCancelOutcome } from "@/lib/orders/cancel-outcome";
import { mapUserFacingErrorT } from "@/lib/i18n/client-messages";
import { formatPrice } from "@/lib/utils";
import type {
  OrderPaymentStatus,
  RefundDisputeStatus,
  RequestStatus,
} from "@/types";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function mapLifecycleError(message: string, t: (key: string) => string): string {
  if (message.includes("must be in progress")) {
    return t("request.lifecycle.mustBeInProgress");
  }
  if (message.includes("cannot be cancelled")) {
    return t("request.lifecycle.cannotCancel");
  }
  if (message.includes("must be paid")) {
    return t("request.lifecycle.mustPayFirst");
  }
  if (message.includes("not found or not authorized")) {
    return t("request.lifecycle.unauthorized");
  }
    if (message.includes("PAID_ORDER_REQUIRES_REFUND_OR_DISPUTE")) {
      return t("request.cancelFlow.paidRequiresAction");
    }
    if (message.includes("Test payments are disabled")) {
      return t("request.cancelFlow.testRefundDisabled");
    }
    if (message.includes("only available for local test")) {
      return t("request.cancelFlow.testActorDenied");
    }
  return mapUserFacingErrorT(message, t);
}

interface RequestLifecycleActionsProps {
  requestId: string;
  customerId: string;
  initialStatus: RequestStatus;
  orderPaymentStatus?: OrderPaymentStatus | null;
  refundDisputeStatus?: RefundDisputeStatus | null;
  workSubmittedAt?: string | null;
  hasWorkSubmission?: boolean;
  paidAmount?: number | null;
  currency?: string;
  viewerUserId?: string | null;
  viewerIsCustomer?: boolean;
  isDemo?: boolean;
}

export function RequestLifecycleActions({
  requestId,
  customerId,
  initialStatus,
  orderPaymentStatus = "unpaid",
  refundDisputeStatus = "none",
  workSubmittedAt = null,
  hasWorkSubmission = false,
  paidAmount = null,
  currency = "USD",
  viewerUserId = null,
  viewerIsCustomer,
  isDemo = false,
}: RequestLifecycleActionsProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [status, setStatus] = useState(initialStatus);
  const [paymentStatus, setPaymentStatus] = useState<OrderPaymentStatus>(
    orderPaymentStatus ?? "unpaid"
  );
  const [disputeStatus, setDisputeStatus] = useState<RefundDisputeStatus>(
    refundDisputeStatus ?? "none"
  );
  const [cancelLoading, setCancelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    setPaymentStatus(orderPaymentStatus ?? "unpaid");
  }, [orderPaymentStatus]);

  useEffect(() => {
    setDisputeStatus(refundDisputeStatus ?? "none");
  }, [refundDisputeStatus]);

  const isRequestOwner = checkRequestOwner({
    customerId,
    userId: user?.id ?? viewerUserId,
    viewerIsOwner: viewerIsCustomer,
    isDemo,
    demoUserId: mockCurrentUser.id,
  });

  const outcome = useMemo(
    () =>
      previewCancelOutcome({
        status,
        orderPaymentStatus: paymentStatus,
        workSubmittedAt,
        hasWorkSubmission,
        refundDisputeStatus: disputeStatus,
      }),
    [status, paymentStatus, workSubmittedAt, hasWorkSubmission, disputeStatus]
  );

  if (!isRequestOwner) return null;

  const canCancel =
    status === "open" || status === "in_progress" || status === "pending_review";

  const confirmTitle =
    outcome === "refunded"
      ? t("request.cancelFlow.confirmRefundTitle")
      : outcome === "dispute_opened"
        ? t("request.cancelFlow.confirmDisputeTitle")
        : t("request.cancelFlow.confirmUnpaidTitle");

  const confirmBody =
    outcome === "refunded"
      ? t("request.cancelFlow.confirmRefundBody", {
          amount: formatPrice(Number(paidAmount ?? 0), currency),
        })
      : outcome === "dispute_opened"
        ? t("request.cancelFlow.confirmDisputeBody")
        : t("request.cancelFlow.confirmUnpaidBody");

  const actionLabel =
    outcome === "dispute_opened"
      ? t("request.cancelFlow.openDispute")
      : outcome === "refunded"
        ? t("request.cancelFlow.refundAndCancel")
        : t("request.cancel");

  const handleConfirm = async () => {
    setError(null);
    if (outcome === "dispute_opened" && reason.trim().length < 5) {
      setError(t("request.cancelFlow.reasonRequired"));
      return;
    }

    setCancelLoading(true);
    try {
      if (isDemo) {
        if (outcome === "dispute_opened") {
          setDisputeStatus("dispute_opened");
        } else if (outcome === "refunded") {
          setStatus("cancelled");
          setPaymentStatus("refunded");
          setDisputeStatus("refunded");
        } else {
          setStatus("cancelled");
        }
        setShowConfirm(false);
        router.refresh();
        return;
      }

      const response = await authFetch(`/api/requests/${requestId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Stable system codes when user leaves reason empty; free-text kept as entered.
          reason:
            reason.trim() ||
            (outcome === "refunded"
              ? "customer_cancel_before_work_submission"
              : outcome === "dispute_opened"
                ? "customer_cancel_after_work_submission"
                : "customer_cancel_unpaid"),
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(mapLifecycleError(result.error ?? t("request.cancelError"), t));
        return;
      }

      setStatus(result.status);
      if (result.orderPaymentStatus) setPaymentStatus(result.orderPaymentStatus);
      if (result.refundDisputeStatus) setDisputeStatus(result.refundDisputeStatus);
      setShowConfirm(false);
      router.refresh();
    } catch {
      setError(t("request.cancelError"));
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-text-primary">{t("request.manageTitle")}</p>
        <div className="flex flex-wrap items-center gap-2">
          {/* Order lifecycle status lives on RequestDetailCard; here only finance status. */}
          <OrderFinanceStatusBadge
            orderPaymentStatus={paymentStatus}
            refundDisputeStatus={disputeStatus}
          />
        </div>
      </div>

      {status === "pending_review" && (
        <p className="mb-3 text-sm text-text-secondary">{t("request.pendingReviewCustomer")}</p>
      )}

      {status === "in_progress" && (
        <p className="mb-3 text-sm text-text-secondary">{t("request.inProgressCustomer")}</p>
      )}

      {disputeStatus === "dispute_opened" && (
        <p className="mb-3 text-sm text-text-secondary">
          {t("request.cancelFlow.disputeOpenHint")}
        </p>
      )}

      {error && (
        <p className="mb-3 rounded-xl bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>
      )}

      {showConfirm && (
        <div className="mb-3 space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-semibold text-text-primary">{confirmTitle}</h3>
          <p className="text-sm text-text-secondary">{confirmBody}</p>
          {(outcome === "dispute_opened" || outcome === "refunded") && (
            <Textarea
              id="cancel-reason"
              label={t("request.cancelFlow.reasonLabel")}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("request.cancelFlow.reasonPlaceholder")}
            />
          )}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant="secondary"
              onClick={() => setShowConfirm(false)}
              disabled={cancelLoading}
            >
              {t("common.cancel")}
            </Button>
            <Button className="flex-1" loading={cancelLoading} onClick={handleConfirm}>
              {actionLabel}
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {canCancel && !showConfirm && disputeStatus !== "dispute_opened" && (
          <Button
            className="flex-1"
            variant="secondary"
            onClick={() => {
              setError(null);
              setShowConfirm(true);
            }}
          >
            {outcome === "dispute_opened"
              ? t("request.cancelFlow.openDispute")
              : t("request.cancel")}
          </Button>
        )}
      </div>
    </div>
  );
}
