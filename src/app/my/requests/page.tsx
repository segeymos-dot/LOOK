import { AppLayout } from "@/components/layout/AppLayout";
import { RequestCard } from "@/components/requests/RequestCard";
import { isDemoMode } from "@/lib/config";
import { mockCurrentUser, mockRequests } from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function MyRequestsPage() {
  if (isDemoMode()) {
    const requests = mockRequests.filter((r) => r.customer_id === mockCurrentUser.id);

    return (
      <AppLayout activePath="/profile">
        <div className="space-y-4 p-4">
          <h1 className="text-xl font-bold">Мои запросы</h1>
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

  const { data: requests } = await supabase
    .from("requests")
    .select("*, customer:profiles(*), category:categories(*)")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <AppLayout activePath="/profile">
      <div className="space-y-4 p-4">
        <h1 className="text-xl font-bold">Мои запросы</h1>

        {requests && requests.length > 0 ? (
          <div className="space-y-3">
            {requests.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
        ) : (
          <p className="py-12 text-center text-gray-500">У вас пока нет запросов</p>
        )}
      </div>
    </AppLayout>
  );
}
