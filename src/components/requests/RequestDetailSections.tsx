"use client";

import { ProviderOfferRespond } from "@/components/offers/ProviderOfferRespond";
import { RequestOffersList } from "@/components/offers/RequestOffersList";
import { ProviderWorkSubmit } from "@/components/requests/ProviderWorkSubmit";
import { CustomerWorkReview } from "@/components/requests/CustomerWorkReview";
import { RequestLifecycleActions } from "@/components/requests/RequestLifecycleActions";
import { OrderDisputeDetails } from "@/components/requests/OrderDisputeDetails";
import { RevisionRequestNotice } from "@/components/requests/RevisionRequestNotice";
import { OrderPaymentPanel } from "@/components/finance/OrderPaymentPanel";
import type { SubmittedReviewView } from "@/components/profile/ReviewForm";
import type {
  Offer,
  OrderDispute,
  OrderPaymentStatus,
  RefundDisputeStatus,
  RequestStatus,
} from "@/types";
import { useState } from "react";

export type RequestDetailSectionsProps = {
  requestId: string;
  customerId: string;
  requestStatus: RequestStatus;
  requestCurrency: string;
  initialOffers: Offer[];
  conversationByOfferId: Record<string, string>;
  viewerUserId?: string | null;
  viewerIsCustomer?: boolean;
  viewerCanActAsProvider?: boolean;
  isDemo?: boolean;
  initialReview?: SubmittedReviewView | null;
  orderPaymentStatus?: OrderPaymentStatus | null;
  refundDisputeStatus?: RefundDisputeStatus | null;
  workSubmittedAt?: string | null;
  hasWorkSubmission?: boolean;
  paidAmount?: number | null;
  revisionFeedback?: string | null;
  initialDispute?: OrderDispute | null;
  disputeFallbackReason?: string | null;
};

export function RequestDetailSections({
  requestId,
  customerId,
  requestStatus,
  requestCurrency,
  initialOffers,
  conversationByOfferId,
  viewerUserId = null,
  viewerIsCustomer,
  viewerCanActAsProvider = false,
  isDemo = false,
  revisionFeedback = null,
  initialReview = null,
  orderPaymentStatus = "unpaid",
  refundDisputeStatus = "none",
  workSubmittedAt = null,
  hasWorkSubmission = false,
  paidAmount = null,
  initialDispute = null,
  disputeFallbackReason = null,
}: RequestDetailSectionsProps) {
  const [offers, setOffers] = useState(initialOffers);
  const acceptedOffer = offers.find((o) => o.status === "accepted");

  const handleOfferSubmitted = (offer: Offer) => {
    setOffers((prev) => {
      const withoutDuplicate = prev.filter((item) => item.id !== offer.id);
      return [offer, ...withoutDuplicate];
    });
  };

  const showDispute =
    refundDisputeStatus === "dispute_opened" ||
    refundDisputeStatus === "refund_rejected" ||
    Boolean(initialDispute);

  return (
    <>
      <RequestLifecycleActions
        requestId={requestId}
        customerId={customerId}
        initialStatus={requestStatus}
        orderPaymentStatus={orderPaymentStatus}
        refundDisputeStatus={refundDisputeStatus}
        workSubmittedAt={workSubmittedAt}
        hasWorkSubmission={hasWorkSubmission}
        paidAmount={paidAmount ?? (acceptedOffer ? Number(acceptedOffer.price) : null)}
        currency={acceptedOffer?.currency ?? requestCurrency}
        viewerUserId={viewerUserId}
        viewerIsCustomer={viewerIsCustomer}
        isDemo={isDemo}
      />
      {showDispute && (
        <OrderDisputeDetails
          requestId={requestId}
          refundDisputeStatus={refundDisputeStatus}
          orderPaymentStatus={orderPaymentStatus}
          currency={acceptedOffer?.currency ?? requestCurrency}
          initialDispute={initialDispute}
          fallbackReason={disputeFallbackReason}
        />
      )}
      {revisionFeedback ? <RevisionRequestNotice feedback={revisionFeedback} /> : null}
      {acceptedOffer && (
        <OrderPaymentPanel
          requestId={requestId}
          customerId={customerId}
          providerId={acceptedOffer.provider_id}
          requestStatus={requestStatus}
          grossAmount={Number(acceptedOffer.price)}
          currency={acceptedOffer.currency}
          viewerUserId={viewerUserId}
          viewerIsCustomer={viewerIsCustomer}
          isDemo={isDemo}
          refundDisputeStatus={refundDisputeStatus}
        />
      )}
      {acceptedOffer && (
        <ProviderWorkSubmit
          requestId={requestId}
          customerId={customerId}
          requestStatus={requestStatus}
          acceptedProviderId={acceptedOffer.provider_id}
          // Shown above as RevisionRequestNotice for all roles — avoid duplicate.
          revisionFeedback={null}
          viewerUserId={viewerUserId}
          viewerIsCustomer={viewerIsCustomer}
          isDemo={isDemo}
        />
      )}
      {acceptedOffer && (
        <CustomerWorkReview
          requestId={requestId}
          customerId={customerId}
          requestStatus={requestStatus}
          grossAmount={Number(acceptedOffer.price)}
          currency={acceptedOffer.currency}
          viewerUserId={viewerUserId}
          viewerIsCustomer={viewerIsCustomer}
          isDemo={isDemo}
        />
      )}
      <ProviderOfferRespond
        requestId={requestId}
        customerId={customerId}
        requestStatus={requestStatus}
        requestCurrency={requestCurrency}
        offers={offers}
        viewerUserId={viewerUserId}
        viewerIsCustomer={viewerIsCustomer}
        viewerCanActAsProvider={viewerCanActAsProvider}
        isDemo={isDemo}
        onOfferSubmitted={handleOfferSubmitted}
      />
      <RequestOffersList
        requestId={requestId}
        initialOffers={offers}
        initialRequestStatus={requestStatus}
        customerId={customerId}
        viewerUserId={viewerUserId}
        viewerIsCustomer={viewerIsCustomer}
        viewerCanActAsProvider={viewerCanActAsProvider}
        isDemo={isDemo}
        conversationByOfferId={conversationByOfferId}
        hideProviderRespond
        initialReview={initialReview}
        onOffersChange={setOffers}
      />
    </>
  );
}

export default RequestDetailSections;
