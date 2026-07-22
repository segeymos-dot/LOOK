"use client";

import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { useTranslation } from "@/components/providers/LocaleProvider";

export function HomeSectionHeaders() {
  const { t } = useTranslation();

  return (
    <>
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-text-primary">
              {t("home.categories")}
            </h2>
            <p className="text-sm text-text-secondary">{t("home.categoriesSub")}</p>
          </div>
          <Link
            href="/search"
            className="flex items-center gap-1 text-sm font-semibold text-brand-600"
          >
            {t("home.all")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}

export function HomeCategoriesHeader() {
  const { t } = useTranslation();
  return (
    <div className="mb-4 flex items-center justify-between">
      <div
        className="flex items-center"
        style={{ gap: "7px", fontSize: "12px", fontWeight: 400 }}
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-text-secondary" aria-hidden />
        <span className="text-text-secondary">Поиск услуг и исполнителей</span>
      </div>
      <Link
        href="/search"
        className="flex items-center gap-1 text-sm font-semibold text-brand-600"
      >
        {t("home.all")}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function HomeRecentHeader() {
  const { t } = useTranslation();
  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-text-primary">
          {t("home.recentRequests")}
        </h2>
        <p className="text-sm text-text-secondary">{t("home.recentRequestsSub")}</p>
      </div>
      <Link
        href="/search"
        className="flex items-center gap-1 text-sm font-semibold text-brand-600"
      >
        {t("home.all")}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function HomeEmptyRequests() {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
      <p className="font-medium text-text-secondary">{t("home.noRequests")}</p>
    </div>
  );
}
