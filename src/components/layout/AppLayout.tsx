"use client";

import Link from "next/link";
import { DemoBanner } from "./DemoBanner";
import { BottomNav } from "./BottomNav";

interface AppLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  hideNav?: boolean;
}

export function AppLayout({ children, activePath = "/", hideNav = false }: AppLayoutProps) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-gray-50">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="px-4 py-3">
          <Link href="/" className="text-xl font-bold text-indigo-600">
            LOOK
          </Link>
        </div>
        <DemoBanner />
      </header>

      <main className={hideNav ? "pb-4" : "pb-20"}>{children}</main>

      {!hideNav && <BottomNav activePath={activePath} />}
    </div>
  );
}
