"use client";

import Link from "next/link";
import { BetaBanner } from "./BetaBanner";
import { DemoBanner } from "./DemoBanner";
import { BottomNav } from "./BottomNav";
import { Avatar } from "@/components/ui/Avatar";
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
            ? "sticky top-0 z-40 bg-white/95 pt-safe shadow-[0_4px_24px_rgba(15,23,42,0.06)] backdrop-blur-md"
            : "glass-header sticky top-0 z-40 border-b border-border-subtle pt-safe"
        }
      >
        <div
          className={
            isHomeHeader
              ? "flex min-w-0 items-center justify-between gap-2 px-4 py-2.5"
              : "flex items-center justify-between px-4 py-3"
          }
        >
          <div className="min-w-0 shrink-0">
            {title ? (
              <h1 className="truncate text-lg font-bold tracking-tight text-text-primary">
                {title}
              </h1>
            ) : (
              <Link href="/" className="inline-block">
                <span
                  className={
                    isHomeHeader
                      ? "text-[1.375rem] font-extrabold tracking-[-0.03em] text-[#1677F2]"
                      : "text-xl font-extrabold tracking-tight text-gradient-brand"
                  }
                >
                  LOOK
                </span>
              </Link>
            )}
          </div>

          <div className="flex min-w-0 items-center justify-end gap-1.5">
            <LanguageSwitcher
              compact
              className={
                isHomeHeader
                  ? "shrink-0 rounded-full border border-[#1677F2]/12 bg-[#F8FBFF] p-0.5 shadow-sm [&_button]:min-w-[2rem] [&_button]:px-2 [&_button]:text-[11px] [&_button:not(.bg-brand-600)]:bg-transparent [&_button:not(.bg-brand-600)]:text-[#64748B] [&_.bg-brand-600]:bg-[#1677F2] [&_.bg-brand-600]:text-white"
                  : undefined
              }
            />
            {user && (
            <Link
              href="/profile"
              className={
                isHomeHeader
                  ? "relative shrink-0 rounded-full transition-opacity hover:opacity-90"
                  : "flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-slate-100"
              }
            >
              <Avatar
                src={resolvedProfile?.avatar_url}
                name={displayName}
                size="sm"
                ring={!isHomeHeader}
                className={isHomeHeader ? "ring-2 ring-white ring-offset-1 ring-offset-white" : undefined}
              />
              {isHomeHeader ? (
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
              ) : (
              <span className="hidden max-w-[80px] truncate text-xs font-medium text-text-secondary sm:inline">
                {displayName.split(" ")[0]}
              </span>
              )}
            </Link>
          )}
          </div>
        </div>
        <BetaBanner />
        <DemoBanner />
      </header>

      <main className={hideNav ? "pb-4" : "pb-24"}>{children}</main>

      {!hideNav && <BottomNav activePath={activePath} />}
    </div>
  );
}
