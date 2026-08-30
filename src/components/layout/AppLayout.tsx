"use client";

import Link from "next/link";
import { DemoBanner } from "./DemoBanner";
import { BottomNav } from "./BottomNav";
import { Avatar } from "@/components/ui/Avatar";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { LocationPromptHost } from "@/components/location/LocationPromptHost";
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
      >
        {isHomeHeader ? null : (
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
              className="flex items-center rounded-full p-1 transition-colors hover:bg-slate-100"
            >
              <Avatar
                src={resolvedProfile?.avatar_url}
                name={displayName}
                size="sm"
                ring
              />
            </Link>
          )}
          </div>
        </div>
        )}
        <DemoBanner />
      </header>

      <main className={hideNav ? "pb-4" : "pb-24"}>{children}</main>

      {user ? <LocationPromptHost /> : null}

      {!hideNav && <BottomNav activePath={activePath} />}
    </div>
  );
}
