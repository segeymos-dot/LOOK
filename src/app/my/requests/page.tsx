import { AppLayout } from "@/components/layout/AppLayout";
import { RequestCard } from "@/components/requests/RequestCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { isDemoMode } from "@/lib/config";
import { mockCurrentUser, mockRequests } from "@/lib/mock/data";
import { attachOffersCounts } from "@/lib/data/conversations-server";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";

export default async function MyRequestsPage() {
  if (isDemoMode()) {
    const requests = mockRequests.filter((r) => r.customer_id === mockCurrentUser.id);

    return (
      <AppLayout activePath="/profile" title="Мои запросы">
        <div className="space-y-5 p-4">
          <PageHeader title="Мои запросы" subtitle="Заказы, которые вы опубликовали" backHref="/profile" />
          <div className="space-y-3">
            {requests.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/my/requests");

  const { data: rawRequests } = await supabase
    .from("requests")
    .select("*, customer:profiles(*), category:categories(*)")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false });

  const requests = await attachOffersCounts(supabase, rawRequests ?? []);

  return (
    <AppLayout activePath="/profile" title="Мои запросы">
      <div className="space-y-5 p-4">
        <PageHeader title="Мои запросы" subtitle="Заказы, которые вы опубликовали" backHref="/profile" />

        <Link href="/requests/new">
          <Button className="w-full gap-2" size="sm">
            Создать заказ
          </Button>
        </Link>

        {requests && requests.length > 0 ? (
          <div className="space-y-3">
            {requests.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="У вас пока нет запросов"
            description="Создайте первый заказ и получите предложения от исполнителей"
            action={
              <Link href="/requests/new">
                <Button>Создать запрос</Button>
              </Link>
            }
          />
        )}
      </div>
    </AppLayout>
  );
}
