"use client";

import Link from "next/link";
import { ArrowRight, Headphones, LockKeyhole, ShieldCheck } from "lucide-react";
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

/** Home trust row — Support opens /support, never user↔user chats. */
export function HomeTrustRow() {
  const { t } = useTranslation();
  const items = [
    {
      label: t("home.trustVerified"),
      Icon: ShieldCheck,
      href: "/search",
    },
    {
      label: t("home.trustSecure"),
      Icon: LockKeyhole,
      href: "/terms",
    },
    {
      label: t("home.trustSupport"),
      Icon: Headphones,
      href: "/support",
    },
  ] as const;

  return (
    <div
      className="grid w-full grid-cols-3 gap-2"
      role="list"
      aria-label={t("home.trustAriaLabel")}
    >
      {items.map(({ label, Icon, href }) => (
        <Link
          key={label}
          href={href}
          role="listitem"
          aria-label={label}
          className="flex min-w-0 flex-col items-center justify-start gap-1.5 rounded-xl border border-border-subtle bg-surface px-2 py-3 text-center transition hover:border-brand-300 hover:bg-brand-50/40"
        >
          <Icon
            aria-hidden
            className="h-5 w-5 text-brand-600"
            strokeWidth={1.75}
          />
          <span className="min-w-0 text-[11.5px] font-medium leading-snug text-text-secondary">
            {label}
          </span>
        </Link>
      ))}
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
