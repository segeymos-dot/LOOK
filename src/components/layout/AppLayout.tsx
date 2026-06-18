"use client";

import Link from "next/link";
import { DemoBanner } from "./DemoBanner";
import { BottomNav } from "./BottomNav";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/hooks/useAuth";

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
  const resolvedProfile = displayProfile ?? profile;
  const displayName =
    resolvedProfile?.full_name ?? user?.email?.split("@")[0] ?? "Профиль";

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-surface-muted">
      <header className="glass-header sticky top-0 z-40 border-b border-border-subtle pt-safe">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="min-w-0">
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
        <DemoBanner />
      </header>

      <main className={hideNav ? "pb-4" : "pb-24"}>{children}</main>

      {!hideNav && <BottomNav activePath={activePath} />}
    </div>
  );
}
