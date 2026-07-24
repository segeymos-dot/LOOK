"use client";

import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useMemo, useState, type ReactNode } from "react";

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

export function HomeGreeting({
  children,
  header,
}: {
  children?: ReactNode;
  header?: ReactNode;
}) {
  // Profile / greeting logic retained (not rendered in this photo-only block).
  const { user, displayProfile, profile } = useAuth();
  const { t } = useTranslation();
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

  void (firstName
    ? t(`home.${greetingKey}Name`, { name: firstName })
    : t(`home.${greetingKey}`));
  void t("home.greetingTitle");
  void t("home.greetingSubtitle");

  return (
    <div
      className="relative min-w-0 w-full overflow-hidden"
      style={{
        minHeight: 352,
        height: 352,
        backgroundImage: "url('/assets/home/greeting-beach.png')",
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {header ? (
        <div
          className="absolute left-0 right-0 top-0 z-[2] flex items-center justify-between"
          style={{ paddingTop: 16, paddingLeft: 16, paddingRight: 16 }}
        >
          {header}
        </div>
      ) : null}

      {children ? (
        <div
          className="absolute z-[1] [&>div]:!mb-0"
          style={{ left: 12, right: 12, bottom: 0 }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
