"use client";

import Link from "next/link";
import {
  BarChart3,
  Building2,
  ChevronRight,
  ClipboardList,
  Scale,
  Headphones,
  Globe2,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "@/components/providers/LocaleProvider";
import {
  formatUnreadBadge,
} from "@/hooks/useAdminSupportUnreadCount";
import { useAdminWebsiteInquiriesUnreadCount } from "@/hooks/useAdminWebsiteInquiriesUnreadCount";
import { cn } from "@/lib/utils";

const LINKS: {
  href: string;
  titleKey: string;
  subtitleKey: string;
  icon: LucideIcon;
  /** Separate unread source — never reuse app support counter. */
  badge?: "website-inquiries";
}[] = [
  {
    href: "/admin/stats",
    titleKey: "admin.nav.stats",
    subtitleKey: "admin.nav.statsSubtitle",
    icon: BarChart3,
  },
  {
    href: "/admin/platform",
    titleKey: "admin.nav.platform",
    subtitleKey: "admin.nav.platformSubtitle",
    icon: Building2,
  },
  {
    href: "/admin/orders",
    titleKey: "admin.nav.orders",
    subtitleKey: "admin.nav.ordersSubtitle",
    icon: ClipboardList,
  },
  {
    href: "/admin/customers",
    titleKey: "admin.nav.customers",
    subtitleKey: "admin.nav.customersSubtitle",
    icon: Users,
  },
  {
    href: "/admin/providers",
    titleKey: "admin.nav.providers",
    subtitleKey: "admin.nav.providersSubtitle",
    icon: UserRound,
  },
  {
    href: "/admin/disputes",
    titleKey: "admin.nav.disputes",
    subtitleKey: "admin.nav.disputesSubtitle",
    icon: Scale,
  },
  {
    href: "/admin/support",
    titleKey: "admin.nav.support",
    subtitleKey: "admin.nav.supportSubtitle",
    icon: Headphones,
  },
  {
    href: "/admin/website-inquiries",
    titleKey: "admin.nav.websiteInquiries",
    subtitleKey: "admin.nav.websiteInquiriesSubtitle",
    icon: Globe2,
    badge: "website-inquiries",
  },
];

export function AdminSectionNav({ activeHref }: { activeHref: string }) {
  const { t } = useTranslation();
  const { count: websiteUnread } = useAdminWebsiteInquiriesUnreadCount(true);
  const websiteBadge = formatUnreadBadge(websiteUnread);

  return (
    <nav aria-label={t("admin.nav.label")}>
      {/* Mobile: vertical cards */}
      <ul className="flex flex-col gap-1.5 md:hidden">
        {LINKS.map((link) => {
          const active =
            activeHref === link.href || activeHref.startsWith(`${link.href}/`);
          const title = t(link.titleKey);
          const subtitle = t(link.subtitleKey);
          const Icon = link.icon;
          const badge =
            link.badge === "website-inquiries" ? websiteBadge : null;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-label={
                  badge
                    ? `${title}. ${subtitle}. ${badge}`
                    : `${title}. ${subtitle}`
                }
                aria-current={active ? "page" : undefined}
                data-testid={
                  link.badge === "website-inquiries"
                    ? "admin-nav-website-inquiries"
                    : undefined
                }
                className={cn(
                  "flex min-h-[48px] items-center gap-2.5 rounded-xl px-3 py-2.5 outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
                  active
                    ? "bg-brand-50 text-brand-800 ring-1 ring-brand-500/40"
                    : "bg-surface text-text-primary ring-1 ring-border-subtle hover:bg-surface-muted active:bg-surface-muted"
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    active
                      ? "bg-brand-100 text-brand-700"
                      : "bg-surface-muted text-text-secondary"
                  )}
                  aria-hidden
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-tight">
                    {title}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block text-xs leading-snug",
                      active ? "text-brand-700/80" : "text-text-secondary"
                    )}
                  >
                    {subtitle}
                  </span>
                </span>
                {badge ? (
                  <span
                    data-testid="admin-website-inquiries-unread-badge"
                    className={cn(
                      "inline-flex min-w-[1.5rem] shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                      active
                        ? "bg-brand-600 text-white"
                        : "bg-red-600 text-white"
                    )}
                  >
                    {badge}
                  </span>
                ) : null}
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0",
                    active ? "text-brand-600" : "text-text-muted"
                  )}
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Desktop / tablet: compact horizontal pills */}
      <div className="hidden gap-2 overflow-x-auto pb-1 md:flex">
        {LINKS.map((link) => {
          const active =
            activeHref === link.href || activeHref.startsWith(`${link.href}/`);
          const badge =
            link.badge === "website-inquiries" ? websiteBadge : null;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              data-testid={
                link.badge === "website-inquiries"
                  ? "admin-nav-website-inquiries-desktop"
                  : undefined
              }
              className={cn(
                "inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors",
                "outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
                active
                  ? "bg-brand-600 text-white"
                  : "bg-surface text-text-secondary ring-1 ring-border-subtle hover:bg-surface-muted"
              )}
            >
              {t(link.titleKey)}
              {badge ? (
                <span
                  data-testid="admin-website-inquiries-unread-badge-desktop"
                  className={cn(
                    "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold tabular-nums",
                    active ? "bg-white/25 text-white" : "bg-red-600 text-white"
                  )}
                >
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
