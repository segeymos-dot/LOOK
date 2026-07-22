import { AppLayout } from "@/components/layout/AppLayout";
import { HomeGreeting } from "@/components/home/HomeGreeting";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeCategoriesHeader, HomeRecentHeader, HomeEmptyRequests } from "@/components/home/HomeSections";
import { CategoryGrid } from "@/components/categories/CategoryGrid";
import { RequestCard } from "@/components/requests/RequestCard";
import { isDemoMode } from "@/lib/config";
import { mockCategories, mockRequests } from "@/lib/mock/data";
import { attachOffersCounts } from "@/lib/data/conversations-server";
import { createClient } from "@/lib/supabase/server";
import { getServerLocale } from "@/lib/i18n/server";
import { localizeCategories, localizeRequests } from "@/lib/i18n/localize-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const locale = await getServerLocale();
  let categories = mockCategories;
  let requests = mockRequests;

  if (!isDemoMode()) {
    const supabase = await createClient();
    const [categoriesRes, requestsRes] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase
        .from("requests")
        .select("*, customer:profiles(*), category:categories(*)")
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    categories = categoriesRes.data ?? [];
    requests = await attachOffersCounts(supabase, requestsRes.data ?? []);
  }

  categories = localizeCategories(categories ?? [], locale);
  requests = localizeRequests(requests ?? [], locale);

  return (
    <AppLayout activePath="/">
      <div
        className="space-y-8 p-4"
        style={{
          backgroundColor: "#EFF8FF",
          backgroundImage:
            "linear-gradient(180deg, #EAF7FF 0%, #F6FBFF 45%, #FFFFFF 100%)",
        }}
      >
        <HomeGreeting />
        <HomeHero />

        <section>
          <HomeCategoriesHeader />
          <CategoryGrid categories={categories ?? []} />
        </section>

        <section>
          <HomeRecentHeader />

          <div className="space-y-3">
            {requests && requests.length > 0 ? (
              requests.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))
            ) : (
              <HomeEmptyRequests />
            )}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
