"use client";

import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useMemo, useState } from "react";

type TimeGreetingKey = "goodMorning" | "goodAfternoon" | "goodEvening";

function getTimeGreetingKey(hour: number): TimeGreetingKey {
  if (hour >= 5 && hour < 12) return "goodMorning";
  if (hour >= 12 && hour < 18) return "goodAfternoon";
  return "goodEvening";
}

function getFirstName(fullName: string | null | undefined): string | undefined {
  const trimmed = fullName?.trim();
  if (!trimmed) return undefined;
  return trimmed.split(/\s+/)[0];
}

/** Ignore only an exact standalone brand placeholder "LOOK". */
function isBrandPlaceholder(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === "look";
}

function firstNameFromSource(value: string | null | undefined): string | undefined {
  if (!value || isBrandPlaceholder(value)) return undefined;
  return getFirstName(value);
}

export function HomeGreeting() {
  const { user, displayProfile, profile } = useAuth();
  const { t, locale } = useTranslation();
  const [greetingKey, setGreetingKey] = useState<TimeGreetingKey>("goodEvening");

  useEffect(() => {
    setGreetingKey(getTimeGreetingKey(new Date().getHours()));
  }, []);

  const firstName = useMemo(() => {
    const profileName = (displayProfile ?? profile)?.full_name;
    const fromProfile = firstNameFromSource(profileName);
    if (fromProfile) return fromProfile;

    const metaFullName = user?.user_metadata?.full_name;
    const fromMetaFullName =
      typeof metaFullName === "string" ? firstNameFromSource(metaFullName) : undefined;
    if (fromMetaFullName) return fromMetaFullName;

    const metaName = user?.user_metadata?.name;
    const fromMetaName =
      typeof metaName === "string" ? firstNameFromSource(metaName) : undefined;
    if (fromMetaName) return fromMetaName;

    const emailLocal = user?.email?.split("@")[0];
    return firstNameFromSource(emailLocal);
  }, [
    displayProfile,
    profile,
    user?.user_metadata?.full_name,
    user?.user_metadata?.name,
    user?.email,
  ]);

  const greetingLine = firstName
    ? t(`home.${greetingKey}Name`, { name: firstName })
    : t(`home.${greetingKey}`);

  const subtitleClassName =
    "mb-2 w-[220px] max-w-[220px] text-left text-[15px] text-[#64748B] sm:text-[16px]";
  const subtitleStyle = { lineHeight: 1.5 } as const;

  return (
    <div className="min-w-0 space-y-3">
      <p className="text-sm font-semibold leading-snug text-[#64748B] sm:text-[15px]">
        {greetingLine} 👋
      </p>
      <h1 className="max-w-full text-[1.875rem] font-extrabold leading-[1.12] tracking-[-0.025em] text-[#111827] sm:text-[2.125rem]">
        {t("home.greetingTitle")}
      </h1>
      {locale === "ru" ? (
        <p className={subtitleClassName} style={subtitleStyle}>
          <span className="block">Создавайте заказы,</span>
          <span className="block">находите исполнителей</span>
          <span className="block">и решайте любые задачи</span>
          <span className="block">легко!</span>
        </p>
      ) : (
        <p className={subtitleClassName} style={subtitleStyle}>
          {t("home.greetingSubtitle")}
        </p>
      )}
    </div>
  );
}
