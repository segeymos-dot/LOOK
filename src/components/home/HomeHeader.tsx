"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/components/providers/LocaleProvider";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { localizeText } from "@/lib/i18n/localize-data";
import { ArrowLeftRight, Bell, ChevronDown, MapPin } from "lucide-react";

/** Language + city pills: compact on narrow phones, unchanged from sm+. */
const pillClass =
  "inline-flex shrink-0 items-center justify-center border border-[#E8ECF1] bg-white box-border rounded-[10px] px-2 py-1 min-h-[30px] sm:rounded-xl sm:px-3 sm:py-2 sm:min-h-9";

type TimeGreetingKey =
  | "goodMorning"
  | "goodAfternoon"
  | "goodEvening"
  | "goodNight";

/** Local-device hour → greeting period (browser timezone). */
function getTimeGreetingKey(hour: number): TimeGreetingKey {
  if (hour >= 5 && hour < 12) return "goodMorning";
  if (hour >= 12 && hour < 18) return "goodAfternoon";
  if (hour >= 18) return "goodEvening";
  return "goodNight";
}

function getFirstName(fullName: string | null | undefined): string | undefined {
  const trimmed = fullName?.trim();
  if (!trimmed || trimmed.includes("@")) return undefined;
  const first = trimmed.split(/\s+/)[0];
  return first || undefined;
}

/** Ignore only an exact standalone brand placeholder "LOOK". */
function isBrandPlaceholder(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === "look";
}

function firstNameFromSource(value: string | null | undefined): string | undefined {
  if (!value || isBrandPlaceholder(value)) return undefined;
  return getFirstName(value);
}

/**
 * Existing Home header controls (language, location, bell, avatar).
 * Same handlers, hrefs, state and visuals as before.
 */
export function HomeHeaderControls() {
  const { user, displayProfile, profile } = useAuth();
  const { locale, setLocale, t } = useTranslation();
  const resolvedProfile = displayProfile ?? profile;
  const displayName =
    resolvedProfile?.full_name ?? user?.email?.split("@")[0] ?? t("nav.profile");
  const locationLabel = resolvedProfile?.city?.trim()
    ? localizeText(resolvedProfile.city, locale)
    : t("home.defaultCity");
  const profileHref = user ? "/profile" : "/login";
  const chatHref = user ? "/chat" : "/login?redirect=/chat";

  const locales: Locale[] = ["ru", "en"];

  return (
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-hidden sm:gap-2.5">
      <div
        className={cn(pillClass, "gap-0.5 sm:gap-1")}
        role="group"
        aria-label={t("common.language")}
      >
        {locales.map((code, index) => (
          <span key={code} className="inline-flex items-center gap-0.5 sm:gap-1">
            {index > 0 ? (
              <ArrowLeftRight
                className="h-2.5 w-2.5 shrink-0 text-[#0F172A] sm:h-3 sm:w-3"
                strokeWidth={2}
                aria-hidden="true"
              />
            ) : null}
            <button
              type="button"
              onClick={() => setLocale(code)}
              className={cn(
                "min-h-[26px] min-w-[1.5rem] px-0.5 text-[10px] font-semibold leading-none transition-colors sm:min-h-0 sm:min-w-[1.625rem] sm:px-0 sm:text-[11px]",
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
          "max-w-[5.75rem] gap-0.5 transition-opacity active:opacity-90 sm:max-w-[7.5rem] sm:gap-1"
        )}
      >
        <MapPin
          className="h-3 w-3 shrink-0 fill-[#6337F5] text-[#6337F5] sm:h-3.5 sm:w-3.5"
          aria-hidden="true"
        />
        <span className="truncate text-[10px] font-semibold leading-none text-[#0F172A] sm:text-[11px]">
          {locationLabel}
        </span>
        <ChevronDown
          className="h-2.5 w-2.5 shrink-0 text-[#64748B] sm:h-3 sm:w-3"
          strokeWidth={2}
          aria-hidden="true"
        />
      </Link>

      <Link
        href={chatHref}
        aria-label={t("nav.chats")}
        className="relative inline-flex shrink-0 items-center justify-center transition-opacity active:opacity-90"
        style={{
          backgroundColor: "#ffffff",
          width: 36,
          height: 36,
          minWidth: 36,
          minHeight: 36,
          borderRadius: "50%",
          padding: 0,
        }}
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
  );
}

/** LOOK wordmark + controls — rendered as the beach-image top overlay. */
export function HomeHeader() {
  const { user, profile, loading, profileReady } = useAuth();
  const { t } = useTranslation();
  const [greetingKey, setGreetingKey] = useState<TimeGreetingKey | null>(null);

  useEffect(() => {
    function updateGreetingPeriod() {
      setGreetingKey(getTimeGreetingKey(new Date().getHours()));
    }

    updateGreetingPeriod();
    const intervalId = window.setInterval(updateGreetingPeriod, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const firstName = useMemo(() => {
    if (loading) return undefined;
    if (user && !profileReady) return undefined;

    const meta = user?.user_metadata;
    const candidates: Array<string | null | undefined> = [
      profile?.full_name,
      typeof meta?.first_name === "string" ? meta.first_name : undefined,
      typeof meta?.firstName === "string" ? meta.firstName : undefined,
      typeof meta?.name === "string" ? meta.name : undefined,
      typeof meta?.full_name === "string" ? meta.full_name : undefined,
    ];

    for (const candidate of candidates) {
      const name = firstNameFromSource(candidate);
      if (name) return name;
    }
    return undefined;
  }, [loading, user, profileReady, profile?.full_name]);

  const greetingText = useMemo(() => {
    if (!greetingKey) return null;
    const timeGreeting = t(`home.${greetingKey}`);
    return firstName
      ? `${timeGreeting}, ${firstName} 👏`
      : `${timeGreeting} 👏`;
  }, [greetingKey, firstName, t]);

  return (
    <div className="relative w-full min-w-0">
      <div
        className="flex shrink-0 flex-col items-start"
        style={{ gap: 12 }}
      >
        <div
          className="flex flex-col items-start"
          style={{ gap: 5 }}
        >
          <Link href="/" className="shrink-0">
            <span
              style={{
                color: "#1677F2",
                fontSize: "40.32px",
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: "-0.03em",
                opacity: 1,
              }}
            >
              LOOK
            </span>
          </Link>
          <p
            style={{
              margin: 0,
              padding: 0,
              fontSize: 13,
              fontWeight: 500,
              lineHeight: 1.2,
              color: "#0F172A",
              whiteSpace: "nowrap",
              minHeight: 16,
            }}
          >
            {greetingText ?? "\u00A0"}
          </p>
        </div>
        <h2
          style={{
            margin: 0,
            padding: 0,
            fontSize: 26,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: "#0F172A",
            textAlign: "left",
          }}
        >
          <span style={{ display: "block", whiteSpace: "nowrap" }}>
            {t("home.greetingTitleLine1")}
          </span>
          <span style={{ display: "block", whiteSpace: "nowrap" }}>
            {t("home.greetingTitleLine2")}
          </span>
        </h2>
        <p
          style={{
            margin: 0,
            padding: 0,
            fontSize: 13,
            fontWeight: 400,
            lineHeight: 1.4,
            color: "#0F172A",
            textAlign: "left",
          }}
        >
          <span style={{ display: "block", whiteSpace: "nowrap" }}>
            {t("home.greetingSubtitleLine1")}
          </span>
          <span style={{ display: "block", whiteSpace: "nowrap" }}>
            {t("home.greetingSubtitleLine2")}
          </span>
          <span style={{ display: "block", whiteSpace: "nowrap" }}>
            {t("home.greetingSubtitleLine3")}
          </span>
        </p>
      </div>

      <div
        className="absolute top-0"
        style={{ right: 0 }}
      >
        <HomeHeaderControls />
      </div>
    </div>
  );
}
