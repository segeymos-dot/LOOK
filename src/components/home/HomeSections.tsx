"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, Headphones, LockKeyhole, Search, ShieldCheck } from "lucide-react";
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
  const router = useRouter();
  const [value, setValue] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-0 flex min-w-0 w-full items-center"
      style={{
        height: "50.4px",
        width: "100%",
        maxWidth: "100%",
        gap: "12px",
        paddingLeft: "16px",
        paddingRight: "16px",
        paddingTop: "10px",
        paddingBottom: "10px",
        backgroundColor: "#FFFFFF",
        border: "1px solid rgba(255, 255, 255, 0.9)",
        borderRadius: "16px",
        fontWeight: 400,
        boxSizing: "border-box",
      }}
    >
      <Search
        className="shrink-0 text-text-secondary"
        style={{ width: 18, height: 18 }}
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t("home.searchPlaceholder")}
        aria-label={t("home.searchPlaceholder")}
        className="min-w-0 w-full flex-1 text-text-secondary placeholder:text-text-secondary"
        style={{
          flex: 1,
          height: "100%",
          minWidth: 0,
          padding: 0,
          border: "none",
          outline: "none",
          background: "transparent",
          fontSize: "15px",
          fontWeight: 400,
          lineHeight: 1.4,
          width: "100%",
        }}
        autoComplete="off"
        enterKeyHint="search"
      />
      <Link
        href="/search"
        className="flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-semibold text-brand-600"
        style={{ flexShrink: 0, whiteSpace: "nowrap" }}
      >
        {t("home.all")}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </form>
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
      href: "/chat",
    },
  ] as const;

  const itemClassName =
    "flex min-w-0 flex-col items-center justify-start text-center rounded-lg transition-opacity hover:opacity-80 active:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1677F2]";
  const itemStyle = { gap: "6px", padding: "4px 2px" } as const;

  return (
    <div
      className="grid w-full max-w-full grid-cols-3 overflow-x-hidden"
      style={{ gap: "8px" }}
      role="list"
      aria-label={t("home.trustAriaLabel")}
    >
      {items.map(({ label, Icon, href }) => {
        const content = (
          <>
            <Icon
              aria-hidden
              style={{ width: 21, height: 21, color: "#1677F2" }}
              strokeWidth={1.75}
            />
            <span
              className="min-w-0 text-center text-[#475569]"
              style={{ fontSize: "11.5px", lineHeight: 1.25, fontWeight: 500 }}
            >
              {label}
            </span>
          </>
        );

        if (href) {
          return (
            <Link
              key={label}
              href={href}
              role="listitem"
              aria-label={label}
              className={`${itemClassName} cursor-pointer`}
              style={itemStyle}
            >
              {content}
            </Link>
          );
        }

        return (
          <div
            key={label}
            role="listitem"
            className="flex min-w-0 flex-col items-center justify-start text-center"
            style={itemStyle}
          >
            {content}
          </div>
        );
      })}
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
