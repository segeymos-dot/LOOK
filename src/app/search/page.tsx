"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/Input";
import { RequestCard } from "@/components/requests/RequestCard";
import { isDemoMode } from "@/lib/config";
import { searchMockRequests } from "@/lib/mock/data";
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
      setRequests(data ?? []);
      setLoading(false);
    };

    const debounce = setTimeout(fetchRequests, 300);
    return () => clearTimeout(debounce);
  }, [query, categorySlug]);

  return (
    <AppLayout activePath="/search">
      <div className="space-y-4 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Поиск запросов..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-200" />
            ))}
          </div>
        ) : requests.length > 0 ? (
          <div className="space-y-3">
            {requests.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-gray-500">
            Ничего не найдено
          </div>
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
