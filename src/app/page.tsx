import { AppLayout } from "@/components/layout/AppLayout";
import { CategoryGrid } from "@/components/categories/CategoryGrid";
import { RequestCard } from "@/components/requests/RequestCard";
import { Button } from "@/components/ui/Button";
import { isDemoMode } from "@/lib/config";
import { mockCategories, mockRequests } from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { PlusCircle } from "lucide-react";

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
    requests = requestsRes.data ?? [];
  }

  return (
    <AppLayout activePath="/">
      <div className="space-y-6 p-4">
        {/* Hero CTA */}
        <section className="rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-800 p-6 text-white">
          <h1 className="mb-2 text-2xl font-bold">Найди исполнителя</h1>
          <p className="mb-4 text-indigo-100">
            Опубликуй запрос и получи предложения от профессионалов
          </p>
          <Link href="/requests/new">
            <Button variant="secondary" className="gap-2">
              <PlusCircle className="h-5 w-5" />
              Создать запрос
            </Button>
          </Link>
        </section>

        {/* Categories */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Категории</h2>
            <Link href="/search" className="text-sm text-indigo-600">
              Все →
            </Link>
          </div>
          <CategoryGrid categories={categories ?? []} />
        </section>

        {/* Recent requests */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Актуальные запросы</h2>
            <Link href="/search" className="text-sm text-indigo-600">
              Все →
            </Link>
          </div>

          <div className="space-y-3">
            {requests && requests.length > 0 ? (
              requests.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
                <p className="text-gray-500">Пока нет запросов</p>
                <Link href="/requests/new" className="mt-2 inline-block text-indigo-600">
                  Создать первый запрос
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
