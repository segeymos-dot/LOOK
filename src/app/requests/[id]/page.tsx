import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequestDetailCard } from "@/components/requests/RequestDetailCard";
import { getRequestOffersForPage } from "@/lib/data/request-offers-server";
import { RequestDetailSections } from "@/components/requests/RequestDetailSections";
import { canActAsProvider } from "@/lib/auth/roles";
import { isDemoMode } from "@/lib/config";
import {
  getMockConversationForOffer,
  getMockOffers,
  getMockRequest,
  mockCurrentUser,
} from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({ params }: PageProps) {
  const { id } = await params;

  if (isDemoMode()) {
    const request = getMockRequest(id);
    if (!request) notFound();

    const offers = getMockOffers(id);
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
          <PageHeader title="Заказ" backHref="/search" />
          <RequestDetailCard request={request} />
          <RequestDetailSections
            requestId={id}
            customerId={request.customer_id}
            requestStatus={request.status}
            initialOffers={offers}
            conversationByOfferId={conversationByOfferId}
            viewerUserId={mockCurrentUser.id}
            viewerIsCustomer={mockCurrentUser.id === request.customer_id}
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

  return (
    <AppLayout activePath="/search" hideNav>
      <div className="space-y-5 p-4">
        <PageHeader title="Заказ" backHref="/search" />
        <RequestDetailCard request={request} />
        <RequestDetailSections
          requestId={id}
          customerId={request.customer_id}
          requestStatus={request.status}
          initialOffers={offers}
          conversationByOfferId={conversations}
          viewerUserId={user?.id ?? null}
          viewerIsCustomer={user ? user.id === request.customer_id : undefined}
          viewerCanActAsProvider={viewerCanActAsProvider}
        />
      </div>
    </AppLayout>
  );
}
