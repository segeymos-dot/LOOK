"use client";

import Link from "next/link";
import { Home, Search, PlusCircle, MessageCircle, User, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface BottomNavProps {
  activePath: string;
}

export function BottomNav({ activePath }: BottomNavProps) {
  const { user, isProvider, isCustomer } = useAuth();

  const navItems = [
    { href: "/", icon: Home, label: "Главная" },
    { href: "/search", icon: Search, label: "Поиск" },
    isCustomer || !user
      ? { href: user ? "/requests/new" : "/login?redirect=/requests/new", icon: PlusCircle, label: "Создать", accent: true }
      : isProvider
        ? { href: "/my/offers", icon: Briefcase, label: "Отклики" }
        : { href: "/login?redirect=/requests/new", icon: PlusCircle, label: "Создать", accent: true },
    { href: "/chat", icon: MessageCircle, label: "Чаты" },
    { href: "/profile", icon: User, label: "Профиль" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pb-safe">
      <div className="mx-auto max-w-lg px-3 pb-2">
        <div className="flex items-center justify-around rounded-2xl border border-border-subtle bg-surface/95 px-1 py-1.5 shadow-nav backdrop-blur-xl">
          {navItems.map(({ href, icon: Icon, label, accent }) => {
            const isActive =
              activePath === href || (href !== "/" && activePath.startsWith(href));

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[10px] font-semibold transition-all",
                  isActive
                    ? "text-brand-600"
                    : "text-text-muted hover:text-text-secondary",
                  accent && !isActive && "text-brand-500"
                )}
              >
                {isActive && (
                  <span className="absolute inset-0 rounded-xl bg-brand-50" />
                )}
                <Icon
                  className={cn(
                    "relative h-5 w-5",
                    isActive && "stroke-[2.5]",
                    accent && !isActive && "text-brand-600"
                  )}
                />
                <span className="relative">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
