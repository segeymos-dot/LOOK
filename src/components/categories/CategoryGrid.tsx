"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode, type SVGProps } from "react";
import type { Category } from "@/types";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import type { AdminUserStats } from "@/lib/admin/user-stats";
import { getCompactCategoryLines, localizeCategoryName } from "@/lib/i18n/localize-data";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Camera,
  Code,
  Hammer,
  Handshake,
  Heart,
  Home,
  MoreHorizontal,
  Palette,
  Scale,
  Truck,
  type LucideIcon,
} from "lucide-react";

interface CategoryGridProps {
  categories: Category[];
  selectedId?: string;
}

const iconMap: Record<string, LucideIcon> = {
  hammer: Hammer,
  code: Code,
  palette: Palette,
  book: BookOpen,
  heart: Heart,
  truck: Truck,
  camera: Camera,
  scale: Scale,
};

/** Soft pastel tile colors by existing icon key (visual only). */
const iconTone: Record<string, { tile: string; icon: string }> = {
  hammer: { tile: "#EDE9FE", icon: "#6337F5" },
  code: { tile: "#DCEEFF", icon: "#1677F2" },
  palette: { tile: "#FFEDD5", icon: "#EA580C" },
  book: { tile: "#DCFCE7", icon: "#16A34A" },
  heart: { tile: "#FCE7F3", icon: "#DB2777" },
  truck: { tile: "#CCFBF1", icon: "#0D9488" },
  camera: { tile: "#FCE7F3", icon: "#C026D3" },
  scale: { tile: "#E0E7FF", icon: "#4F46E5" },
};

const defaultTone = { tile: "#DCEEFF", icon: "#1677F2" };
const repairTone = { tile: "#EDE9FE", icon: "#6337F5" };
const itTone = { tile: "#DCEEFF", icon: "#1677F2" };
const allCategoriesTone = { tile: "#F1F5F9", icon: "#64748B" };

/** Existing slugs (mock/DB). */
const REPAIR_CATEGORY_SLUG = "repair";
const IT_CATEGORY_SLUG = "it";
const DESIGN_CATEGORY_SLUG = "design";
const EDUCATION_CATEGORY_SLUG = "education";
const BEAUTY_CATEGORY_SLUG = "beauty";
const TRANSPORT_CATEGORY_SLUG = "transport";
const PHOTO_CATEGORY_SLUG = "photo";
const LEGAL_CATEGORY_SLUG = "legal";
const OTHER_CATEGORY_SLUG = "other";

const compactLabelStyle = { fontSize: "10px", lineHeight: 1.15 } as const;
const ONLINE_POLL_MS = 30_000;

type OnlineCounts = {
  customers: number | null;
  providers: number | null;
};

/**
 * Shared poll for admin home online tiles (one /api/admin/user-stats request).
 * Matches customers-online refresh: mount, 30s interval, visibilitychange, no-store.
 */
function useAdminOnlineCounts(enabled: boolean): OnlineCounts {
  const [counts, setCounts] = useState<OnlineCounts>({
    customers: null,
    providers: null,
  });

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await authFetch("/api/admin/user-stats", {
        cache: "no-store",
        signal,
      });
      const data = (await res.json()) as { stats?: AdminUserStats };
      if (!res.ok || !data.stats) return;
      setCounts({
        customers: Number(data.stats.customersOnline ?? 0),
        providers: Number(data.stats.providersOnline ?? 0),
      });
    } catch {
      // keep last known values on blips
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void load(controller.signal);
    const timer = setInterval(() => {
      void load();
    }, ONLINE_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, load]);

  return counts;
}

/** Line-style hand holding a parcel — matches Lucide stroke weight at 20–24px. */
function HandHoldingPackageIcon({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      {/* Parcel / box */}
      <path d="M9 2.75h6l1.25 2.5v5.5H7.75V5.25L9 2.75Z" />
      <path d="M12 2.75v4.25" />
      <path d="M7.75 7.25h8.5" />
      {/* Hand under parcel */}
      <path d="M8 14.5h7.25a1.75 1.75 0 0 1 0 3.5H10" />
      <path d="M8 14.5V12a1.5 1.5 0 0 1 3 0v2.5" />
      <path d="M5.5 16v3.25A1.75 1.75 0 0 0 7.25 21h6" />
      <path d="M5.5 16H8" />
    </svg>
  );
}

function AdminOnlineMetricTile({
  href,
  count,
  tone,
  icon,
  line1,
  line2,
  ariaLabel,
}: {
  href: string;
  count: number | null;
  tone: { tile: string; icon: string };
  icon: ReactNode;
  line1: string;
  line2: string;
  ariaLabel: string;
}) {
  const display = count === null ? "—" : String(count);

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="relative flex min-w-0 flex-col items-center justify-start gap-2 p-0.5 text-center transition-transform active:scale-[0.99]"
    >
      <span
        className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl"
        style={{ backgroundColor: tone.tile, color: tone.icon }}
      >
        {icon}
        <span
          className="mt-0.5 font-bold tabular-nums leading-none"
          style={{ fontSize: 13, color: tone.icon }}
        >
          {display}
        </span>
      </span>
      <p
        className="w-full text-center font-semibold text-[#111827]"
        style={compactLabelStyle}
      >
        <span className="block">{line1}</span>
        <span className="block">{line2}</span>
      </p>
    </Link>
  );
}

export function CategoryGrid({ categories, selectedId }: CategoryGridProps) {
  const { locale, t } = useTranslation();
  const { isPlatformAdmin, profileReady } = useAuth();
  const showAdminOnlineTiles = profileReady && isPlatformAdmin;
  const onlineCounts = useAdminOnlineCounts(Boolean(showAdminOnlineTiles));

  const repairIndex = categories.findIndex((c) => c.slug === REPAIR_CATEGORY_SLUG);
  const itIndex = categories.findIndex((c) => c.slug === IT_CATEGORY_SLUG);
  const customersReplaceIndex = repairIndex >= 0 ? repairIndex : 0;
  const providersReplaceIndex = itIndex >= 0 ? itIndex : 1;

  return (
    <div
      className="mx-auto gap-x-1.5 gap-y-3 overflow-x-hidden"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        width: "100%",
      }}
    >
      {categories.map((category, index) => {
        if (showAdminOnlineTiles && index === customersReplaceIndex) {
          const display =
            onlineCounts.customers === null
              ? "—"
              : String(onlineCounts.customers);
          return (
            <AdminOnlineMetricTile
              key="admin-customers-online"
              href="/admin/customers?onlineOnly=1"
              count={onlineCounts.customers}
              tone={repairTone}
              icon={
                <Handshake className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
              }
              line1={t("home.customersOnlineLine1")}
              line2={t("home.customersOnlineLine2")}
              ariaLabel={t("home.customersOnlineAria", { count: display })}
            />
          );
        }

        if (showAdminOnlineTiles && index === providersReplaceIndex) {
          const display =
            onlineCounts.providers === null
              ? "—"
              : String(onlineCounts.providers);
          return (
            <AdminOnlineMetricTile
              key="admin-providers-online"
              href="/admin/providers?onlineOnly=1"
              count={onlineCounts.providers}
              tone={itTone}
              icon={
                <HandHoldingPackageIcon className="h-5 w-5 shrink-0" />
              }
              line1={t("home.providersOnlineLine1")}
              line2={t("home.providersOnlineLine2")}
              ariaLabel={t("home.providersOnlineAria", { count: display })}
            />
          );
        }

        const isRepair = category.slug === REPAIR_CATEGORY_SLUG;
        const isIt = category.slug === IT_CATEGORY_SLUG;
        const isDesign = category.slug === DESIGN_CATEGORY_SLUG;
        const isEducation = category.slug === EDUCATION_CATEGORY_SLUG;
        const isBeauty = category.slug === BEAUTY_CATEGORY_SLUG;
        const isTransport = category.slug === TRANSPORT_CATEGORY_SLUG;
        const isPhoto = category.slug === PHOTO_CATEGORY_SLUG;
        const isLegal = category.slug === LEGAL_CATEGORY_SLUG;
        const isOther = category.slug === OTHER_CATEGORY_SLUG;
        const isCompact =
          isRepair ||
          isIt ||
          isDesign ||
          isEducation ||
          isBeauty ||
          isTransport ||
          isPhoto ||
          isLegal ||
          isOther;
        const Icon = isRepair
          ? Home
          : (category.icon && iconMap[category.icon]) || Hammer;
        const tone = isRepair
          ? repairTone
          : (category.icon && iconTone[category.icon]) || defaultTone;
        const isSelected = selectedId === category.id;
        const labelLines = getCompactCategoryLines(category.slug, locale);

        return (
          <Link
            key={category.id}
            href={`/search?category=${category.slug}`}
            className={cn(
              "relative flex min-w-0 flex-col items-center text-center transition-transform active:scale-[0.99]",
              isCompact
                ? "justify-start gap-2 p-0.5"
                : "min-h-[116px] justify-center gap-3 overflow-hidden rounded-[20px] bg-white p-4",
              !isCompact && isSelected && "ring-2 ring-[#1677F2]/25"
            )}
            style={
              isCompact
                ? undefined
                : {
                    border: "1px solid #EEF2F7",
                    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
                  }
            }
          >
            <span
              className={cn(
                "flex shrink-0 items-center justify-center",
                isCompact
                  ? "h-14 w-14 rounded-2xl"
                  : "h-[44px] w-[44px] rounded-[14px]"
              )}
              style={{ backgroundColor: tone.tile, color: tone.icon }}
            >
              <Icon
                className={isCompact ? "h-6 w-6" : "h-5 w-5"}
                aria-hidden
              />
            </span>
            {isCompact && labelLines ? (
              <p
                className="w-full text-center font-semibold text-[#111827]"
                style={compactLabelStyle}
              >
                {labelLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </p>
            ) : (
              <p
                className={cn(
                  "line-clamp-2 w-full font-semibold text-[#111827]",
                  isCompact
                    ? "text-[12.5px] leading-tight"
                    : "text-[14px] leading-snug"
                )}
              >
                {localizeCategoryName(category, locale)}
              </p>
            )}
          </Link>
        );
      })}

      {/* Local nav only — not from category data. Existing browse route: /search */}
      <Link
        href="/search"
        className="relative flex min-w-0 flex-col items-center justify-start gap-2 p-0.5 text-center transition-transform active:scale-[0.99]"
      >
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: allCategoriesTone.tile,
            color: allCategoriesTone.icon,
          }}
        >
          <MoreHorizontal className="h-6 w-6" aria-hidden />
        </span>
        <p
          className="w-full text-center font-semibold text-[#111827]"
          style={compactLabelStyle}
        >
          <span className="block">{t("home.allCategoriesLine1")}</span>
          <span className="block">{t("home.allCategoriesLine2")}</span>
        </p>
      </Link>
    </div>
  );
}
