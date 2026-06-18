"use client";

import { RequestOffersList } from "@/components/offers/RequestOffersList";
import { RequestTestPayment } from "@/components/finance/RequestTestPayment";
import { RequestLifecycleActions } from "@/components/requests/RequestLifecycleActions";
import type { Offer, RequestStatus } from "@/types";

export type RequestDetailSectionsProps = {
  requestId: string;
  customerId: string;
  requestStatus: RequestStatus;
  initialOffers: Offer[];
  conversationByOfferId: Record<string, string>;
  viewerUserId?: string | null;
  viewerIsCustomer?: boolean;
  viewerCanActAsProvider?: boolean;
  isDemo?: boolean;
};

export function RequestDetailSections({
  requestId,
  customerId,
  requestStatus,
  initialOffers,
  conversationByOfferId,
  viewerUserId = null,
  viewerIsCustomer,
  viewerCanActAsProvider = false,
  isDemo = false,
}: RequestDetailSectionsProps) {
  const acceptedOffer = initialOffers.find((o) => o.status === "accepted");

  return (
    <>
      <RequestLifecycleActions
        requestId={requestId}
        customerId={customerId}
        initialStatus={requestStatus}
        viewerUserId={viewerUserId}
        viewerIsCustomer={viewerIsCustomer}
        isDemo={isDemo}
      />
      {acceptedOffer && (
        <RequestTestPayment
          requestId={requestId}
          requestStatus={requestStatus}
          customerId={customerId}
          grossAmount={Number(acceptedOffer.price)}
          currency={acceptedOffer.currency}
          isDemo={isDemo}
          viewerUserId={viewerUserId}
          viewerIsCustomer={viewerIsCustomer}
        />
      )}
      <RequestOffersList
        requestId={requestId}
        initialOffers={initialOffers}
        initialRequestStatus={requestStatus}
        customerId={customerId}
        viewerUserId={viewerUserId}
        viewerIsCustomer={viewerIsCustomer}
        viewerCanActAsProvider={viewerCanActAsProvider}
        isDemo={isDemo}
        conversationByOfferId={conversationByOfferId}
      />
    </>
  );
}

export default RequestDetailSections;
