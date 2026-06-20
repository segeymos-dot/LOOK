"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/Input";
import { RequestCard } from "@/components/requests/RequestCard";
import { RequestCardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { isDemoMode } from "@/lib/config";
import { searchMockRequests } from "@/lib/mock/data";
import { attachOffersCounts } from "@/lib/data/conversations-server";
import { createClient } from "@/lib/supabase/client";
import type { Request } from "@/types";
import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function SearchContent() {
  const searchParams = useSearchParams();
  const categorySlug = searchParams.get("category");
  const [query, setQuery] = useState("");
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRequests = async () => {
      setLoading(true);

      if (isDemoMode()) {
        setRequests(searchMockRequests(query, categorySlug));
        setLoading(false);
        return;
      }

      const load = async () => {
        const supabase = createClient();

        let q = supabase
          .from("requests")
          .select("*, customer:profiles(*), category:categories(*)")
          .in("status", ["open", "in_progress"])
          .order("created_at", { ascending: false });

        if (categorySlug) {
          const { data: category } = await supabase
            .from("categories")
            .select("id")
            .eq("slug", categorySlug)
            .single();

          if (category) {
            q = q.eq("category_id", category.id);
          }
        }

        if (query.trim()) {
          q = q.or(`title.ilike.%${query}%,description.ilike.%${query}%`);
        }

        const { data } = await q.limit(20);
        return attachOffersCounts(supabase, data ?? []);
      };

      try {
        const timeout = new Promise<Request[]>((resolve) =>
          window.setTimeout(() => resolve([]), 8000)
        );
        const data = await Promise.race([load(), timeout]);
        setRequests(data);
      } catch {
        setRequests([]);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchRequests, 300);
    return () => clearTimeout(debounce);
  }, [query, categorySlug]);

  return (
    <AppLayout activePath="/search" title="Поиск">
      <div className="space-y-5 p-4">
        <PageHeader
          title="Поиск заказов"
          subtitle={categorySlug ? `Категория: ${categorySlug}` : "Найдите подходящий заказ"}
        />

        <div className="relative">
          <Search className="absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder="Поиск по названию или описанию..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-11 shadow-card"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <RequestCardSkeleton key={i} />
            ))}
          </div>
        ) : requests.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">Найдено: {requests.length}</p>
            {requests.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Search}
            title="Ничего не найдено"
            description="Попробуйте изменить запрос или выбрать другую категорию"
          />
        )}
      </div>
    </AppLayout>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  );
}
