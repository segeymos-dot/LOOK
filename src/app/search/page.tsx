"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/Input";
import { RequestCard } from "@/components/requests/RequestCard";
import { RequestCardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { expandSearchTerms } from "@/lib/i18n/demo-data-translations";
import { getCategoryLabel } from "@/lib/i18n/localize-data";
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
  const { t, locale } = useTranslation();
  const categorySlug = searchParams.get("category");
  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    const fetchRequests = async () => {
      setLoading(true);

      if (isDemoMode()) {
        setRequests(searchMockRequests(query, categorySlug, locale));
        setLoading(false);
        return;
      }

      const load = async () => {
        const supabase = createClient();

        // Active marketplace browse only — soft-trashed duplicates must not appear.
        let q = supabase
          .from("requests")
          .select("*, customer:profiles(*), category:categories(*)")
          .in("status", ["open", "in_progress"])
          .is("trashed_at", null)
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
          const terms = expandSearchTerms(query, locale);
          const clauses = terms.flatMap((term) => [
            `title.ilike.%${term}%`,
            `description.ilike.%${term}%`,
          ]);
          q = q.or(clauses.join(","));
        }

        const { data } = await q.limit(20);
        const withCounts = await attachOffersCounts(supabase, data ?? []);
        // Defensive: unique by request.id even if a join/query ever doubles a row.
        const seen = new Set<string>();
        return withCounts.filter((row) => {
          if (!row?.id || seen.has(row.id)) return false;
          seen.add(row.id);
          return true;
        });
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
  }, [query, categorySlug, locale]);

  return (
    <AppLayout activePath="/search" title={t("search.pageTitle")}>
      <div className="space-y-5 p-4">
        <PageHeader
          title={t("search.title")}
          subtitle={
            categorySlug
              ? t("search.subtitleCategory", { name: getCategoryLabel(categorySlug, locale) })
              : t("search.subtitle")
          }
        />

        <div className="relative">
          <Search className="absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder={t("search.placeholder")}
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
            <p className="text-sm text-text-secondary">
              {t("search.found", { count: requests.length })}
            </p>
            {requests.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Search}
            title={t("search.empty")}
            description={t("search.emptyDesc")}
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
