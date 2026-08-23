import { IncomingDirectedList } from "@/components/provider/IncomingDirectedList";
import { canActAsProvider } from "@/lib/auth/roles";
import { isDemoMode } from "@/lib/config";
import { fetchIncomingDirectedRequests } from "@/lib/data/incoming-directed-requests";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function IncomingDirectedPage() {
  if (isDemoMode()) {
    return <IncomingDirectedList items={[]} pendingCount={0} />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/my/incoming");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !canActAsProvider(profile.role)) {
    redirect("/profile");
  }

  const items = await fetchIncomingDirectedRequests(supabase, user.id);
  const pendingCount = items.filter((i) => i.inbox_status === "new").length;

  return <IncomingDirectedList items={items} pendingCount={pendingCount} />;
}
