"use client";

import { ProviderOfferRespond } from "@/components/offers/ProviderOfferRespond";
import { RequestOffersList } from "@/components/offers/RequestOffersList";
import { RequestTestPayment } from "@/components/finance/RequestTestPayment";
import { RequestLifecycleActions } from "@/components/requests/RequestLifecycleActions";
import type { Offer, RequestStatus } from "@/types";
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
}: RequestDetailSectionsProps) {
  const [offers, setOffers] = useState(initialOffers);
  const acceptedOffer = offers.find((o) => o.status === "accepted");

  const handleOfferSubmitted = (offer: Offer) => {
    setOffers((prev) => {
      const withoutDuplicate = prev.filter((item) => item.id !== offer.id);
      return [offer, ...withoutDuplicate];
    });
  };

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
        initialOffers={offers}
        initialRequestStatus={requestStatus}
        customerId={customerId}
        viewerUserId={viewerUserId}
        viewerIsCustomer={viewerIsCustomer}
        viewerCanActAsProvider={viewerCanActAsProvider}
        isDemo={isDemo}
        conversationByOfferId={conversationByOfferId}
        hideProviderRespond
        onOffersChange={setOffers}
      />
    </>
  );
}

export default RequestDetailSections;
