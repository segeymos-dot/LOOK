import { AppLayout } from "@/components/layout/AppLayout";
import { OrderPaymentScreen } from "@/components/finance/OrderPaymentScreen";
import { isDemoMode } from "@/lib/config";
import { getMockOrderPayment, initDemoOrderPayment } from "@/lib/mock/order-payments";
import { getMockOffers, getMockRequest } from "@/lib/mock/data";
import { getServerLocale } from "@/lib/i18n/server";
import { localizeRequest } from "@/lib/i18n/localize-data";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function RequestPaymentPage({ params }: PageProps) {
  const { id } = await params;
  const locale = await getServerLocale();

  if (isDemoMode()) {
    const request = getMockRequest(id);
    if (!request) notFound();
    const offer = getMockOffers(id).find((o) => o.status === "accepted");
    if (!offer || request.status !== "in_progress") {
      redirect(`/requests/${id}`);
    }

    if (!getMockOrderPayment(id)) {
      initDemoOrderPayment({
        requestId: id,
        customerId: request.customer_id,
        providerId: offer.provider_id,
        orderAmount: Number(offer.price),
        currency: offer.currency,
        requestTitle: request.title,
      });
    }

    const mockPay = getMockOrderPayment(id);
    const localized = localizeRequest(request, locale);

    return (
      <AppLayout activePath="/search" hideNav>
        <div className="p-4">
          <Suspense fallback={null}>
            <OrderPaymentScreen
              requestId={id}
              requestTitle={localized.title}
              customerId={request.customer_id}
              grossAmount={Number(offer.price)}
              currency={offer.currency}
              initialOrderPaymentStatus={mockPay?.order_payment_status ?? "unpaid"}
            />
          </Suspense>
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
    .select(
      "*, customer:profiles(*), category:categories(*)"
    )
    .eq("id", id)
    .single();

  if (!request) notFound();

  if (!user || user.id !== request.customer_id) {
    redirect(`/requests/${id}`);
  }

  if (request.status !== "in_progress") {
    redirect(`/requests/${id}`);
  }

  const { data: offer } = await supabase
    .from("offers")
    .select("*")
    .eq("request_id", id)
    .eq("status", "accepted")
    .maybeSingle();

  if (!offer) {
    redirect(`/requests/${id}`);
  }

  const localized = localizeRequest(request, locale);
  const grossAmount = Number(request.order_amount ?? offer.price);
  const currency = request.currency ?? offer.currency;

  return (
    <AppLayout activePath="/search" hideNav>
      <div className="p-4">
        <Suspense fallback={null}>
          <OrderPaymentScreen
            requestId={id}
            requestTitle={localized.title}
            customerId={request.customer_id}
            grossAmount={grossAmount}
            currency={currency}
            initialOrderPaymentStatus={request.order_payment_status ?? "unpaid"}
          />
        </Suspense>
      </div>
    </AppLayout>
  );
}
