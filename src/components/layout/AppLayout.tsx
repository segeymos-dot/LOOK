"use client";

import Link from "next/link";
import { BetaBanner } from "./BetaBanner";
import { DemoBanner } from "./DemoBanner";
import { BottomNav } from "./BottomNav";
import { Avatar } from "@/components/ui/Avatar";
import { HomeHeader } from "@/components/home/HomeHeader";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/components/providers/LocaleProvider";

interface AppLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  hideNav?: boolean;
  title?: string;
}

export function AppLayout({
  children,
  activePath = "/",
  hideNav = false,
  title,
}: AppLayoutProps) {
  const { user, displayProfile, profile } = useAuth();
  const { t } = useTranslation();
  const resolvedProfile = displayProfile ?? profile;
  const displayName =
    resolvedProfile?.full_name ?? user?.email?.split("@")[0] ?? t("nav.profile");

  const isHomeHeader = activePath === "/" && !title;

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-surface-muted">
      <header
        className={
          isHomeHeader
            ? "sticky top-0 z-40 pt-safe"
            : "glass-header sticky top-0 z-40 border-b border-border-subtle pt-safe"
        }
        style={
          isHomeHeader
            ? {
                backgroundColor: "#BFE8FF",
                backgroundImage:
                  "linear-gradient(180deg, #BFE8FF 0%, #D9F3FF 100%)",
              }
            : undefined
        }
      >
        {isHomeHeader ? (
          <HomeHeader />
        ) : (
        <div className="flex items-center justify-between px-4 py-3">
          <div className="min-w-0 shrink-0">
            {title ? (
              <h1 className="truncate text-lg font-bold tracking-tight text-text-primary">
                {title}
              </h1>
            ) : (
              <Link href="/" className="inline-block">
                <span className="text-xl font-extrabold tracking-tight text-gradient-brand">
                  LOOK
                </span>
              </Link>
            )}
          </div>

          <div className="flex min-w-0 items-center justify-end gap-1.5">
            <LanguageSwitcher compact />
            {user && (
            <Link
              href="/profile"
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-slate-100"
            >
              <Avatar
                src={resolvedProfile?.avatar_url}
                name={displayName}
                size="sm"
                ring
              />
              <span className="hidden max-w-[80px] truncate text-xs font-medium text-text-secondary sm:inline">
                {displayName.split(" ")[0]}
              </span>
            </Link>
          )}
          </div>
        </div>
        )}
        {activePath !== "/" && <BetaBanner />}
        <DemoBanner />
      </header>

      <main className={hideNav ? "pb-4" : "pb-24"}>{children}</main>

      {!hideNav && <BottomNav activePath={activePath} />}
    </div>
  );
}
