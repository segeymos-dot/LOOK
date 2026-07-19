import { OfferDetailView } from "@/components/offers/OfferDetailView";
import { getWorkLifecycleState } from "@/lib/data/work-lifecycle-state";
import { getOfferForPage } from "@/lib/data/fetch-offer-server";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import {
  getMockConversationForOffer,
  getMockOffer,
  getMockRequest,
  mockCurrentUser,
} from "@/lib/mock/data";
import { notFound, redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string; offerId: string }>;
}

export const dynamic = "force-dynamic";

export default async function OfferDetailPage({ params }: PageProps) {
  const { id: requestId, offerId } = await params;

  if (isDemoMode()) {
    const request = getMockRequest(requestId);
    const offer = getMockOffer(offerId);

    if (!request || !offer || offer.request_id !== requestId) {
      notFound();
    }

    const conversation = getMockConversationForOffer(offerId);

    return (
      <OfferDetailView
        initialOffer={offer}
        requestId={requestId}
        customerId={request.customer_id}
        initialRequestStatus={request.status}
        initialConversationId={conversation?.id ?? null}
        viewerUserId={mockCurrentUser.id}
        viewerIsCustomer={mockCurrentUser.id === request.customer_id}
        isDemo
      />
    );
  }

  const { offer, userId, conversationId } = await getOfferForPage(
    requestId,
    offerId
  );

  if (!userId) {
    redirect(
      `/login?redirect=${encodeURIComponent(`/requests/${requestId}/offers/${offerId}`)}`
    );
  }

  if (!offer?.request) {
    notFound();
  }

  const supabase = await createClient();
  const lifecycle = await getWorkLifecycleState(supabase, requestId);
  const effectiveStatus = lifecycle?.effectiveStatus ?? offer.request.status;

  return (
    <OfferDetailView
      initialOffer={offer}
      requestId={requestId}
      customerId={offer.request.customer_id}
      initialRequestStatus={effectiveStatus}
      initialConversationId={conversationId}
      viewerUserId={userId}
      viewerIsCustomer={userId === offer.request.customer_id}
      revisionFeedback={lifecycle?.revisionFeedback ?? null}
    />
  );
}
