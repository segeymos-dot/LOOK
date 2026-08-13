"use client";

import Link from "next/link";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin/stats", key: "admin.nav.stats" },
  { href: "/admin/platform", key: "admin.nav.platform" },
  { href: "/admin/orders", key: "admin.nav.orders" },
  { href: "/admin/customers", key: "admin.nav.customers" },
  { href: "/admin/providers", key: "admin.nav.providers" },
  { href: "/admin/disputes", key: "admin.nav.disputes" },
] as const;

export function AdminSectionNav({ activeHref }: { activeHref: string }) {
  const { t } = useTranslation();

  return (
    <nav
      className="flex gap-2 overflow-x-auto pb-1"
      aria-label={t("admin.nav.label")}
    >
      {LINKS.map((link) => {
        const active = activeHref === link.href || activeHref.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "inline-flex min-h-[44px] shrink-0 items-center rounded-full px-3.5 text-xs font-semibold transition-colors",
              active
                ? "bg-brand-600 text-white"
                : "bg-surface text-text-secondary ring-1 ring-border-subtle hover:bg-surface-muted"
            )}
          >
            {t(link.key)}
          </Link>
        );
      })}
    </nav>
  );
}
