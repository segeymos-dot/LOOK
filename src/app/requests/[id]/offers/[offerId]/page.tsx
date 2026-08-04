import { OfferDetailView } from "@/components/offers/OfferDetailView";
import { getWorkLifecycleState } from "@/lib/data/work-lifecycle-state";
import { getOrderDisputeForRequest } from "@/lib/data/order-disputes";
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
  const [lifecycle, dispute, requestRes] = await Promise.all([
    getWorkLifecycleState(supabase, requestId),
    getOrderDisputeForRequest(supabase, requestId),
    supabase
      .from("requests")
      .select("refund_dispute_status, refund_reason, cancellation_reason")
      .eq("id", requestId)
      .maybeSingle(),
  ]);
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
      refundDisputeStatus={requestRes.data?.refund_dispute_status ?? "none"}
      initialDispute={dispute}
      disputeFallbackReason={
        requestRes.data?.refund_reason ??
        requestRes.data?.cancellation_reason ??
        null
      }
    />
  );
}
