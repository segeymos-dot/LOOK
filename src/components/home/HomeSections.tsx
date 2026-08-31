"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  ArrowRight,
  Headphones,
  LockKeyhole,
  Mail,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import {
  formatUnreadBadge,
  useAdminSupportUnreadCount,
} from "@/hooks/useAdminSupportUnreadCount";
import { isDemoMode } from "@/lib/config";
import { cn } from "@/lib/utils";

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
  const { isPlatformAdmin, profileReady } = useAuth();
  const [value, setValue] = useState("");
  const adminMode = profileReady && isPlatformAdmin;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  // Platform admin: no search bar — only standalone “Все →” over the beach hero.
  if (adminMode) {
    return (
      <div
        className="mb-0 flex w-full min-w-0 items-center justify-end"
        style={{
          height: "50.4px",
          paddingLeft: "16px",
          paddingRight: "4px",
          boxSizing: "border-box",
        }}
        data-testid="admin-home-all-link-row"
      >
        <Link
          href="/admin/overview"
          data-testid="admin-home-all-link"
          className="flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-semibold text-brand-600"
          style={{
            flexShrink: 0,
            whiteSpace: "nowrap",
            textShadow: "0 1px 2px rgba(255,255,255,0.85)",
          }}
        >
          {t("home.all")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      data-testid="home-search-bar"
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

/** Home trust row — Support opens admin inbox for platform admins, else /support. Never user↔user chats. */
export function HomeTrustRow() {
  const { t } = useTranslation();
  const { isPlatformAdmin } = useAuth();
  const supportHref =
    isPlatformAdmin || isDemoMode() ? "/admin/support" : "/support";
  // Envelope is always shown for platform admin (even at 0). Red count only when > 0.
  const showAdminEnvelope = isPlatformAdmin || isDemoMode();
  const { count: unreadSupport } = useAdminSupportUnreadCount(showAdminEnvelope);
  const unreadLabel = formatUnreadBadge(unreadSupport);

  const items = [
    {
      key: "verified",
      label: t("home.trustVerified"),
      Icon: ShieldCheck,
      href: "/search",
      showEnvelope: false,
      badge: null as string | null,
    },
    {
      key: "secure",
      label: t("home.trustSecure"),
      Icon: LockKeyhole,
      href: "/terms",
      showEnvelope: false,
      badge: null as string | null,
    },
    {
      key: "support",
      label: t("home.trustSupport"),
      // Admin home: always Mail (envelope). Guests keep Headphones.
      Icon: showAdminEnvelope ? Mail : Headphones,
      href: supportHref,
      showEnvelope: showAdminEnvelope,
      badge: showAdminEnvelope ? unreadLabel : null,
    },
  ] as const;

  const itemClassName =
    "flex min-w-0 flex-col items-center justify-start text-center rounded-lg transition-opacity hover:opacity-80 active:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1677F2]";
  const itemStyle = { gap: "6px", padding: "6px 2px 4px" } as const;

  return (
    <div
      className="grid w-full max-w-full grid-cols-3 overflow-visible"
      style={{ gap: "8px" }}
      role="list"
      aria-label={t("home.trustAriaLabel")}
      data-testid="home-trust-row"
    >
      {items.map(({ key, label, Icon, href, badge, showEnvelope }) => {
        const content = (
          <>
            <span
              className="relative inline-flex items-center justify-center"
              style={{ width: 28, height: 26 }}
              data-testid={
                key === "support" && showEnvelope
                  ? "admin-support-envelope"
                  : undefined
              }
            >
              <Icon
                aria-hidden
                style={{ width: 22, height: 22, color: "#1677F2" }}
                strokeWidth={1.75}
              />
              {badge ? (
                <span
                  data-testid="admin-support-unread-badge"
                  className={cn(
                    "absolute -right-1 -top-1 z-10 flex h-[18px] min-w-[18px] items-center justify-center",
                    "rounded-full bg-[#E11D48] px-[5px] text-[10px] font-bold leading-none text-white",
                    "shadow-sm ring-2 ring-white"
                  )}
                  aria-label={t("home.supportUnreadAria", { count: badge })}
                >
                  {badge}
                </span>
              ) : null}
            </span>
            <span
              className="min-w-0 text-center text-[#475569]"
              style={{ fontSize: "11.5px", lineHeight: 1.25, fontWeight: 500 }}
            >
              {label}
            </span>
          </>
        );

        return (
          <Link
            key={key}
            href={href}
            role="listitem"
            aria-label={
              badge
                ? `${label}, ${t("home.supportUnreadAria", { count: badge })}`
                : label
            }
            className={`${itemClassName} cursor-pointer`}
            style={itemStyle}
            data-testid={key === "support" ? "home-trust-support" : undefined}
          >
            {content}
          </Link>
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
