import { AppLayout } from "@/components/layout/AppLayout";
import { RequestCreatedBanner } from "@/components/requests/RequestCreatedBanner";
import { RequestDetailCard } from "@/components/requests/RequestDetailCard";
import { RequestDetailPageHeader } from "@/components/requests/RequestDetailPageHeader";
import { getWorkLifecycleState } from "@/lib/data/work-lifecycle-state";
import { getRequestOffersForPage } from "@/lib/data/request-offers-server";
import { getServerLocale } from "@/lib/i18n/server";
import { localizeOffers, localizeRequest } from "@/lib/i18n/localize-data";
import { RequestDetailSections } from "@/components/requests/RequestDetailSections";
import { canActAsProvider } from "@/lib/auth/roles";
import { isDemoMode } from "@/lib/config";
import {
  getMockConversationForOffer,
  getMockOffers,
  getMockRequest,
  mockCurrentUser,
} from "@/lib/mock/data";
import { getMockOrderPayment, initDemoOrderPayment } from "@/lib/mock/order-payments";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  const locale = await getServerLocale();

  if (isDemoMode()) {
    const request = getMockRequest(id);
    if (!request) notFound();

    const localizedRequest = localizeRequest(request, locale);
    const offers = localizeOffers(getMockOffers(id), locale);
    const acceptedOffer = offers.find((o) => o.status === "accepted");
    if (
      acceptedOffer &&
      localizedRequest.status === "in_progress" &&
      !getMockOrderPayment(id)
    ) {
      initDemoOrderPayment({
        requestId: id,
        customerId: localizedRequest.customer_id,
        providerId: acceptedOffer.provider_id,
        orderAmount: Number(acceptedOffer.price),
        currency: acceptedOffer.currency,
        requestTitle: localizedRequest.title,
      });
    }
    const conversationByOfferId = offers.reduce<Record<string, string>>(
      (map, offer) => {
        const conversation = getMockConversationForOffer(offer.id);
        if (conversation) map[offer.id] = conversation.id;
        return map;
      },
      {}
    );

    return (
      <AppLayout activePath="/search" hideNav>
        <div className="space-y-5 p-4">
          <RequestDetailPageHeader />
          <RequestDetailCard request={localizedRequest} />
          <RequestDetailSections
            requestId={id}
            customerId={localizedRequest.customer_id}
            requestStatus={localizedRequest.status}
            requestCurrency={localizedRequest.currency}
            initialOffers={offers}
            conversationByOfferId={conversationByOfferId}
            viewerUserId={mockCurrentUser.id}
            viewerIsCustomer={mockCurrentUser.id === localizedRequest.customer_id}
            viewerCanActAsProvider={mockCurrentUser.role !== "customer"}
            isDemo
          />
        </div>
      </AppLayout>
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: request } = await supabase
    .from("requests")
    .select("*, customer:profiles(*), category:categories(*)")
    .eq("id", id)
    .single();

  if (!request) notFound();

  let viewerCanActAsProvider = false;
  if (user) {
    const { data: viewerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    viewerCanActAsProvider = canActAsProvider(viewerProfile?.role);
  }

  const { offers, conversations } = await getRequestOffersForPage(id);
  const lifecycle = await getWorkLifecycleState(supabase, id);
  const effectiveStatus = lifecycle?.effectiveStatus ?? request.status;
  const revisionFeedback = lifecycle?.revisionFeedback ?? null;
  const localizedRequest = localizeRequest(
    { ...request, status: effectiveStatus, offers_count: offers.length },
    locale
  );
  const localizedOffers = localizeOffers(offers, locale);

  return (
    <AppLayout activePath="/search" hideNav>
      <div className="space-y-5 p-4">
        <RequestDetailPageHeader />
        <Suspense>
          <RequestCreatedBanner />
        </Suspense>
        <RequestDetailCard request={localizedRequest} />
        <RequestDetailSections
          requestId={id}
          customerId={request.customer_id}
          requestStatus={effectiveStatus}
          requestCurrency={request.currency}
          initialOffers={localizedOffers}
          conversationByOfferId={conversations}
          viewerUserId={user?.id ?? null}
          viewerIsCustomer={user ? user.id === request.customer_id : undefined}
          viewerCanActAsProvider={viewerCanActAsProvider}
          revisionFeedback={revisionFeedback}
        />
      </div>
    </AppLayout>
  );
}
