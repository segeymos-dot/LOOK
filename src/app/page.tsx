import { AppLayout } from "@/components/layout/AppLayout";
import { HomeHero } from "@/components/home/HomeHero";
import { CategoryGrid } from "@/components/categories/CategoryGrid";
import { RequestCard } from "@/components/requests/RequestCard";
import { Button } from "@/components/ui/Button";
import { isDemoMode } from "@/lib/config";
import { mockCategories, mockRequests } from "@/lib/mock/data";
import { attachOffersCounts } from "@/lib/data/conversations-server";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
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

  return (
    <AppLayout activePath="/">
      <div className="space-y-8 p-4">
        <HomeHero />

        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-text-primary">Категории</h2>
              <p className="text-sm text-text-secondary">Выберите направление</p>
            </div>
            <Link
              href="/search"
              className="flex items-center gap-1 text-sm font-semibold text-brand-600"
            >
              Все
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <CategoryGrid categories={categories ?? []} />
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-text-primary">
                Актуальные запросы
              </h2>
              <p className="text-sm text-text-secondary">Свежие заказы от заказчиков</p>
            </div>
            <Link
              href="/search"
              className="flex items-center gap-1 text-sm font-semibold text-brand-600"
            >
              Все
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="space-y-3">
            {requests && requests.length > 0 ? (
              requests.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
                <p className="font-medium text-text-secondary">Пока нет запросов</p>
                <Link href="/requests/new" className="mt-4 inline-block">
                  <Button size="sm">Создать первый запрос</Button>
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
