import { AppLayout } from "@/components/layout/AppLayout";
import { HomeGreeting } from "@/components/home/HomeGreeting";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeHeader } from "@/components/home/HomeHeader";
import { HomeCategoriesHeader, HomeTrustRow } from "@/components/home/HomeSections";
import { CategoryGrid } from "@/components/categories/CategoryGrid";
import { isDemoMode } from "@/lib/config";
import { mockCategories } from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/server";
import { getServerLocale } from "@/lib/i18n/server";
import { localizeCategories } from "@/lib/i18n/localize-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const locale = await getServerLocale();
  let categories = mockCategories;

  if (!isDemoMode()) {
    const supabase = await createClient();
    const categoriesRes = await supabase
      .from("categories")
      .select("*")
      .order("sort_order");
    categories = categoriesRes.data ?? [];
  }

  categories = localizeCategories(categories ?? [], locale);

  return (
    <AppLayout activePath="/">
      <div
        style={{
          backgroundColor: "#EFF8FF",
          backgroundImage:
            "linear-gradient(180deg, #EAF7FF 0%, #F6FBFF 45%, #FFFFFF 100%)",
        }}
      >
        {/* Full content-column width (matches Header bar edges; cancels page inset) */}
        <HomeGreeting header={<HomeHeader />}>
          <HomeCategoriesHeader />
        </HomeGreeting>

        {/* Thin separation before category grid */}
        <div aria-hidden style={{ height: 8, width: "100%" }} />

        <div className="space-y-8 px-4 pb-4">
          <section>
            <CategoryGrid categories={categories ?? []} />
          </section>

          <HomeHero />

          <section>
            <HomeTrustRow />
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
