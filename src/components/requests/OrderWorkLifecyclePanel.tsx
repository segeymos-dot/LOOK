"use client";

import { CustomerWorkReview } from "@/components/requests/CustomerWorkReview";
import { ProviderWorkSubmit } from "@/components/requests/ProviderWorkSubmit";
import { OrderPaymentPanel } from "@/components/finance/OrderPaymentPanel";
import { OrderDisputeDetails } from "@/components/requests/OrderDisputeDetails";
import { RevisionRequestNotice } from "@/components/requests/RevisionRequestNotice";
import type {
  OrderDispute,
  OrderPaymentStatus,
  RefundDisputeStatus,
  RequestStatus,
} from "@/types";

interface OrderWorkLifecyclePanelProps {
  requestId: string;
  customerId: string;
  requestStatus: RequestStatus;
  grossAmount: number;
  currency: string;
  acceptedProviderId?: string | null;
  revisionFeedback?: string | null;
  orderPaymentStatus?: OrderPaymentStatus | null;
  refundDisputeStatus?: RefundDisputeStatus | null;
  initialDispute?: OrderDispute | null;
  disputeFallbackReason?: string | null;
  viewerUserId?: string | null;
  viewerIsCustomer?: boolean;
  isDemo?: boolean;
  className?: string;
  onSuccess?: () => void;
}

export function OrderWorkLifecyclePanel({
  requestId,
  customerId,
  requestStatus,
  grossAmount,
  currency,
  acceptedProviderId,
  revisionFeedback,
  orderPaymentStatus = null,
  refundDisputeStatus = "none",
  initialDispute = null,
  disputeFallbackReason = null,
  viewerUserId,
  viewerIsCustomer,
  isDemo = false,
  className,
  onSuccess,
}: OrderWorkLifecyclePanelProps) {
  const showDispute =
    refundDisputeStatus === "dispute_opened" ||
    refundDisputeStatus === "refund_rejected" ||
    Boolean(initialDispute);

  if (
    requestStatus === "open" ||
    (requestStatus === "cancelled" && !showDispute)
  ) {
    return null;
  }

  const showProvider = requestStatus === "in_progress";
  const showCustomer = requestStatus === "pending_review";

  if (!showProvider && !showCustomer && !showDispute && !revisionFeedback) {
    return null;
  }

  return (
    <div className={className ?? "space-y-4"}>
      {showDispute && (
        <OrderDisputeDetails
          requestId={requestId}
          refundDisputeStatus={refundDisputeStatus}
          orderPaymentStatus={orderPaymentStatus}
          currency={currency}
          initialDispute={initialDispute}
          fallbackReason={disputeFallbackReason}
        />
      )}
      {revisionFeedback ? <RevisionRequestNotice feedback={revisionFeedback} /> : null}
      {acceptedProviderId && (
        <OrderPaymentPanel
          requestId={requestId}
          customerId={customerId}
          providerId={acceptedProviderId}
          requestStatus={requestStatus}
          grossAmount={grossAmount}
          currency={currency}
          viewerUserId={viewerUserId}
          viewerIsCustomer={viewerIsCustomer}
          isDemo={isDemo}
          refundDisputeStatus={refundDisputeStatus}
          onPaid={onSuccess}
        />
      )}
      {showProvider && acceptedProviderId && (
        <ProviderWorkSubmit
          requestId={requestId}
          customerId={customerId}
          requestStatus={requestStatus}
          acceptedProviderId={acceptedProviderId}
          revisionFeedback={null}
          viewerUserId={viewerUserId}
          viewerIsCustomer={viewerIsCustomer}
          isDemo={isDemo}
          onSuccess={onSuccess}
        />
      )}
      {showCustomer && (
        <CustomerWorkReview
          requestId={requestId}
          customerId={customerId}
          requestStatus={requestStatus}
          grossAmount={grossAmount}
          currency={currency}
          viewerUserId={viewerUserId}
          viewerIsCustomer={viewerIsCustomer}
          isDemo={isDemo}
          onSuccess={onSuccess}
        />
      )}
    </div>
  );
}
