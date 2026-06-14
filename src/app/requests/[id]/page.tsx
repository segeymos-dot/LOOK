import { AppLayout } from "@/components/layout/AppLayout";
import { RequestOffersList } from "@/components/offers/RequestOffersList";
import { RequestLifecycleActions } from "@/components/requests/RequestLifecycleActions";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { getRequestOffersForPage } from "@/lib/data/request-offers-server";
import { isDemoMode } from "@/lib/config";
import {
  getMockConversationForOffer,
  getMockOffers,
  getMockRequest,
} from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Calendar } from "lucide-react";

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
        <div className="space-y-4 p-4">
          <Link href="/search" className="text-sm text-indigo-600">
            ← Назад
          </Link>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between">
              <h1 className="text-xl font-bold">{request.title}</h1>
              <Badge status={request.status} />
            </div>

            <p className="mb-4 text-gray-700">{request.description}</p>

            <div className="mb-4 flex flex-wrap gap-3 text-sm text-gray-600">
              {request.budget_max && (
                <span className="font-medium text-gray-900">
                  Бюджет: до {formatPrice(request.budget_max, request.currency)}
                </span>
              )}
              {request.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {request.location}
                </span>
              )}
            </div>

            {request.customer && (
              <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                <Avatar
                  src={request.customer.avatar_url}
                  name={request.customer.full_name}
                />
                <span className="text-sm text-gray-600">{request.customer.full_name}</span>
              </div>
            )}
          </div>

          <RequestLifecycleActions
            requestId={id}
            customerId={request.customer_id}
            initialStatus={request.status}
            isDemo
          />

          <RequestOffersList
            requestId={id}
            initialOffers={offers}
            initialRequestStatus={request.status}
            customerId={request.customer_id}
            isDemo
            conversationByOfferId={conversationByOfferId}
          />
        </div>
      </AppLayout>
    );
  }

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("requests")
    .select("*, customer:profiles(*), category:categories(*)")
    .eq("id", id)
    .single();

  if (!request) notFound();

  const { offers, conversations } = await getRequestOffersForPage(id);

  return (
    <AppLayout activePath="/search" hideNav>
      <div className="space-y-4 p-4">
        <Link href="/search" className="text-sm text-indigo-600">
          ← Назад
        </Link>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between">
            <h1 className="text-xl font-bold">{request.title}</h1>
            <Badge status={request.status} />
          </div>

          <p className="mb-4 text-gray-700">{request.description}</p>

          <div className="mb-4 flex flex-wrap gap-3 text-sm text-gray-600">
            {request.budget_max && (
              <span className="font-medium text-gray-900">
                Бюджет: до {formatPrice(request.budget_max, request.currency)}
              </span>
            )}
            {request.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {request.location}
              </span>
            )}
            {request.deadline && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {new Date(request.deadline).toLocaleDateString("ru-RU")}
              </span>
            )}
          </div>

          {request.customer && (
            <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
              <Avatar
                src={request.customer.avatar_url}
                name={request.customer.full_name}
              />
              <span className="text-sm text-gray-600">{request.customer.full_name}</span>
            </div>
          )}
        </div>

        <RequestLifecycleActions
          requestId={id}
          customerId={request.customer_id}
          initialStatus={request.status}
        />

        <RequestOffersList
          requestId={id}
          initialOffers={offers}
          initialRequestStatus={request.status}
          customerId={request.customer_id}
          conversationByOfferId={conversations}
        />
      </div>
    </AppLayout>
  );
}
