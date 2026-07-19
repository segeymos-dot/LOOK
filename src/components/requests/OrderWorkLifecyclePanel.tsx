"use client";

import { CustomerWorkReview } from "@/components/requests/CustomerWorkReview";
import { ProviderWorkSubmit } from "@/components/requests/ProviderWorkSubmit";
import { OrderPaymentPanel } from "@/components/finance/OrderPaymentPanel";
import type { RequestStatus } from "@/types";

interface OrderWorkLifecyclePanelProps {
  requestId: string;
  customerId: string;
  requestStatus: RequestStatus;
  grossAmount: number;
  currency: string;
  acceptedProviderId?: string | null;
  revisionFeedback?: string | null;
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
  viewerUserId,
  viewerIsCustomer,
  isDemo = false,
  className,
  onSuccess,
}: OrderWorkLifecyclePanelProps) {
  if (requestStatus === "open" || requestStatus === "cancelled") {
    return null;
  }

  const showProvider = requestStatus === "in_progress";
  const showCustomer = requestStatus === "pending_review";

  if (!showProvider && !showCustomer) return null;

  return (
    <div className={className ?? "space-y-4"}>
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
          onPaid={onSuccess}
        />
      )}
      {showProvider && acceptedProviderId && (
        <ProviderWorkSubmit
          requestId={requestId}
          customerId={customerId}
          requestStatus={requestStatus}
          acceptedProviderId={acceptedProviderId}
          revisionFeedback={revisionFeedback}
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
