"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/components/providers/LocaleProvider";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ArrowLeftRight, Bell, ChevronDown, MapPin } from "lucide-react";

const pillClass =
  "inline-flex shrink-0 items-center rounded-full border border-[#E8ECF1] bg-[#F4F6F9]";

export function HomeHeader() {
  const { user, displayProfile, profile } = useAuth();
  const { locale, setLocale, t } = useTranslation();
  const resolvedProfile = displayProfile ?? profile;
  const displayName =
    resolvedProfile?.full_name ?? user?.email?.split("@")[0] ?? t("nav.profile");
  const locationLabel = resolvedProfile?.city?.trim() || "Бангкок";
  const profileHref = user ? "/profile" : "/login";
  const chatHref = user ? "/chat" : "/login?redirect=/chat";

  const locales: Locale[] = ["ru", "en"];

  return (
    <div className="flex min-w-0 items-center justify-between gap-2 px-4 py-3">
      <Link href="/" className="shrink-0 pr-1">
        <span
          style={{
            color: "#1677F2",
            fontSize: "36px",
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            opacity: 1,
          }}
        >
          LOOK
        </span>
      </Link>

      <div className="flex min-w-0 items-center gap-2">
        <div
          className={cn(pillClass, "gap-1 px-2.5 py-1.5")}
          role="group"
          aria-label={t("common.language")}
        >
          {locales.map((code, index) => (
            <span key={code} className="inline-flex items-center gap-1">
              {index > 0 ? (
                <ArrowLeftRight
                  className="h-3 w-3 shrink-0 text-[#0F172A]"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              ) : null}
              <button
                type="button"
                onClick={() => setLocale(code)}
                className={cn(
                  "min-w-[1.625rem] text-[11px] font-semibold leading-none transition-colors",
                  locale === code ? "text-[#0F172A]" : "text-[#64748B] hover:text-[#0F172A]"
                )}
              >
                {code.toUpperCase()}
              </button>
            </span>
          ))}
        </div>

        <Link
          href={profileHref}
          className={cn(
            pillClass,
            "h-8 max-w-[7.5rem] gap-1 px-2.5 transition-opacity active:opacity-90"
          )}
        >
          <MapPin
            className="h-3.5 w-3.5 shrink-0 fill-[#6337F5] text-[#6337F5]"
            aria-hidden="true"
          />
          <span className="truncate text-[11px] font-semibold leading-none text-[#0F172A]">
            {locationLabel}
          </span>
          <ChevronDown
            className="h-3 w-3 shrink-0 text-[#64748B]"
            strokeWidth={2}
            aria-hidden="true"
          />
        </Link>

        <Link
          href={chatHref}
          aria-label={t("nav.chats")}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center transition-opacity active:opacity-90"
        >
          <Bell className="h-[18px] w-[18px] text-[#0F172A]" strokeWidth={1.75} aria-hidden="true" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#6337F5]" />
        </Link>

        <Link
          href={profileHref}
          aria-label={t("nav.profile")}
          className="relative shrink-0 transition-opacity active:opacity-90"
        >
          <Avatar
            src={resolvedProfile?.avatar_url}
            name={displayName}
            size="sm"
            className="ring-2 ring-white"
          />
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#22C55E]" />
        </Link>
      </div>
    </div>
  );
}
