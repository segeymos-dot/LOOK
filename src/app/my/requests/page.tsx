import { MyRequestsContent } from "@/components/requests/MyRequestsContent";
import { isDemoMode } from "@/lib/config";
import { mockCurrentUser, mockRequests } from "@/lib/mock/data";
import { attachOffersCounts } from "@/lib/data/conversations-server";
import { attachEffectiveRequestStatuses } from "@/lib/data/work-lifecycle-state";
import { createClient } from "@/lib/supabase/server";
import { getServerLocale } from "@/lib/i18n/server";
import { localizeRequests } from "@/lib/i18n/localize-data";
import { redirect } from "next/navigation";

export default async function MyRequestsPage() {
  const locale = await getServerLocale();

  if (isDemoMode()) {
    const requests = localizeRequests(
      mockRequests.filter((r) => r.customer_id === mockCurrentUser.id),
      locale
    );
    return <MyRequestsContent requests={requests} showCreateButton={false} />;
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

  const requests = localizeRequests(
    await attachOffersCounts(
      supabase,
      await attachEffectiveRequestStatuses(supabase, rawRequests ?? [])
    ),
    locale
  );

  return <MyRequestsContent requests={requests ?? []} />;
}
