"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
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
const designTone = { tile: "#FFEDD5", icon: "#EA580C" };
const educationTone = { tile: "#DCFCE7", icon: "#16A34A" };
const beautyTone = { tile: "#FCE7F3", icon: "#DB2777" };
const transportTone = { tile: "#CCFBF1", icon: "#0D9488" };
const photoTone = { tile: "#FCE7F3", icon: "#C026D3" };
const legalTone = { tile: "#E0E7FF", icon: "#4F46E5" };
/** "other" has icon "more" (not in iconTone) → default blue tile. */
const otherTone = { tile: "#DCEEFF", icon: "#1677F2" };
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

type HomeMetricCounts = {
  customersOnline: number | null;
  providersOnline: number | null;
  registeredUsers: number | null;
  /** Same as profile AdminPlatformPulseCard: totalVisits / total_visits. */
  totalVisits: number | null;
  /** profiles with role customer|both, platform admins excluded. */
  registeredCustomers: number | null;
  /** profiles with role provider|both, platform admins excluded. */
  registeredProviders: number | null;
  /** Non-trashed requests (= /admin/orders all). */
  totalOrders: number | null;
  /** status=completed (= /admin/orders?tab=completed). */
  completedOrders: number | null;
};

/**
 * Shared poll for admin home metric tiles (one /api/admin/stats request).
 * Mount + 30s interval + visibilitychange, cache: no-store.
 * On failure keep null ("—") — never invent fake zeros.
 */
function useAdminHomeMetricCounts(enabled: boolean): HomeMetricCounts {
  const [counts, setCounts] = useState<HomeMetricCounts>({
    customersOnline: null,
    providersOnline: null,
    registeredUsers: null,
    totalVisits: null,
    registeredCustomers: null,
    registeredProviders: null,
    totalOrders: null,
    completedOrders: null,
  });

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await authFetch("/api/admin/stats", {
        cache: "no-store",
        signal,
      });
      const data = (await res.json()) as { stats?: AdminUserStats; error?: string };
      if (!res.ok || !data.stats) {
        console.error("[CategoryGrid admin stats]", data.error || res.status);
        return;
      }
      setCounts({
        customersOnline: Number(data.stats.customersOnline),
        providersOnline: Number(data.stats.providersOnline),
        registeredUsers: Number(data.stats.registeredUsers),
        totalVisits: Number(data.stats.totalVisits),
        registeredCustomers: Number(data.stats.registeredCustomers),
        registeredProviders: Number(data.stats.registeredProviders),
        totalOrders: Number(data.stats.totalOrders),
        completedOrders: Number(data.stats.completedOrders),
      });
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "AbortError") return;
      console.error("[CategoryGrid admin stats]", error);
      // keep last known / null — do not write fake zeros
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

function AdminOnlineMetricTile({
  href,
  count,
  tone,
  icon,
  centerLabel,
  lines,
  ariaLabel,
}: {
  href: string;
  /** Omit entirely for empty nav tiles (no number, no glyph). */
  count?: number | null;
  tone: { tile: string; icon: string };
  /** Omit for count-only / empty tiles. */
  icon?: ReactNode;
  /** Centered text mark (e.g. LOOK) when no count/icon. */
  centerLabel?: string;
  lines: string[];
  ariaLabel: string;
}) {
  const showCount = count !== undefined;
  const display = count === null ? "—" : showCount ? String(count) : "";
  const countOnly = showCount && !icon;
  const showCenterLabel = Boolean(centerLabel) && !showCount && !icon;

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
        {showCount ? (
          <span
            className={cn(
              "font-bold tabular-nums leading-none",
              icon ? "mt-0.5" : undefined
            )}
            style={{
              fontSize: countOnly ? 22 : 13,
              color: tone.icon,
            }}
          >
            {display}
          </span>
        ) : null}
        {showCenterLabel ? (
          <span
            className="font-bold leading-none tracking-tight"
            style={{
              fontSize: 18,
              color: tone.icon,
            }}
          >
            {centerLabel}
          </span>
        ) : null}
      </span>
      <p
        className="w-full text-center font-semibold text-[#111827]"
        style={compactLabelStyle}
      >
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </p>
    </Link>
  );
}

export function CategoryGrid({ categories, selectedId }: CategoryGridProps) {
  const { locale, t } = useTranslation();
  const { isPlatformAdmin, profileReady } = useAuth();
  const showAdminOnlineTiles = profileReady && isPlatformAdmin;
  const metricCounts = useAdminHomeMetricCounts(Boolean(showAdminOnlineTiles));

  const repairIndex = categories.findIndex((c) => c.slug === REPAIR_CATEGORY_SLUG);
  const itIndex = categories.findIndex((c) => c.slug === IT_CATEGORY_SLUG);
  const designIndex = categories.findIndex((c) => c.slug === DESIGN_CATEGORY_SLUG);
  const educationIndex = categories.findIndex((c) => c.slug === EDUCATION_CATEGORY_SLUG);
  const beautyIndex = categories.findIndex((c) => c.slug === BEAUTY_CATEGORY_SLUG);
  const transportIndex = categories.findIndex((c) => c.slug === TRANSPORT_CATEGORY_SLUG);
  const photoIndex = categories.findIndex((c) => c.slug === PHOTO_CATEGORY_SLUG);
  const legalIndex = categories.findIndex((c) => c.slug === LEGAL_CATEGORY_SLUG);
  const otherIndex = categories.findIndex((c) => c.slug === OTHER_CATEGORY_SLUG);
  const customersReplaceIndex = repairIndex >= 0 ? repairIndex : 0;
  const providersReplaceIndex = itIndex >= 0 ? itIndex : 1;
  const registeredReplaceIndex = designIndex >= 0 ? designIndex : 2;
  const totalVisitsReplaceIndex = educationIndex >= 0 ? educationIndex : 3;
  const platformReplaceIndex = beautyIndex >= 0 ? beautyIndex : 4;
  const registeredCustomersReplaceIndex = transportIndex >= 0 ? transportIndex : 5;
  const registeredProvidersReplaceIndex = photoIndex >= 0 ? photoIndex : 6;
  const totalOrdersReplaceIndex = legalIndex >= 0 ? legalIndex : 7;
  const completedOrdersReplaceIndex = otherIndex >= 0 ? otherIndex : 8;

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
            metricCounts.customersOnline === null
              ? "—"
              : String(metricCounts.customersOnline);
          return (
            <AdminOnlineMetricTile
              key="admin-customers-online"
              href="/admin/customers?onlineOnly=1"
              count={metricCounts.customersOnline}
              tone={repairTone}
              lines={[
                t("home.customersOnlineLine1"),
                t("home.customersOnlineLine2"),
              ]}
              ariaLabel={t("home.customersOnlineAria", { count: display })}
            />
          );
        }

        if (showAdminOnlineTiles && index === providersReplaceIndex) {
          const display =
            metricCounts.providersOnline === null
              ? "—"
              : String(metricCounts.providersOnline);
          return (
            <AdminOnlineMetricTile
              key="admin-providers-online"
              href="/admin/providers?onlineOnly=1"
              count={metricCounts.providersOnline}
              tone={itTone}
              lines={[
                t("home.providersOnlineLine1"),
                t("home.providersOnlineLine2"),
              ]}
              ariaLabel={t("home.providersOnlineAria", { count: display })}
            />
          );
        }

        if (showAdminOnlineTiles && index === registeredReplaceIndex) {
          const display =
            metricCounts.registeredUsers === null
              ? "—"
              : String(metricCounts.registeredUsers);
          return (
            <AdminOnlineMetricTile
              key="admin-registered-users"
              href="/admin/customers"
              count={metricCounts.registeredUsers}
              tone={designTone}
              lines={[
                t("home.registeredUsersLine1"),
                t("home.registeredUsersLine2"),
              ]}
              ariaLabel={t("home.registeredUsersAria", { count: display })}
            />
          );
        }

        if (showAdminOnlineTiles && index === totalVisitsReplaceIndex) {
          const display =
            metricCounts.totalVisits === null
              ? "—"
              : String(metricCounts.totalVisits);
          return (
            <AdminOnlineMetricTile
              key="admin-total-visits"
              href="/admin/stats"
              count={metricCounts.totalVisits}
              tone={educationTone}
              lines={[
                t("home.totalVisitsLine1"),
                t("home.totalVisitsLine2"),
              ]}
              ariaLabel={t("home.totalVisitsAria", { count: display })}
            />
          );
        }

        if (showAdminOnlineTiles && index === platformReplaceIndex) {
          return (
            <AdminOnlineMetricTile
              key="admin-platform"
              href="/admin/platform"
              tone={beautyTone}
              centerLabel="LOOK"
              lines={[t("home.platformTile")]}
              ariaLabel={t("home.platformTileAria")}
            />
          );
        }

        if (showAdminOnlineTiles && index === registeredCustomersReplaceIndex) {
          const display =
            metricCounts.registeredCustomers === null
              ? "—"
              : String(metricCounts.registeredCustomers);
          return (
            <AdminOnlineMetricTile
              key="admin-registered-customers"
              href="/admin/customers"
              count={metricCounts.registeredCustomers}
              tone={transportTone}
              lines={[
                t("home.registeredCustomersLine1"),
                t("home.registeredCustomersLine2"),
              ]}
              ariaLabel={t("home.registeredCustomersAria", { count: display })}
            />
          );
        }

        if (showAdminOnlineTiles && index === registeredProvidersReplaceIndex) {
          const display =
            metricCounts.registeredProviders === null
              ? "—"
              : String(metricCounts.registeredProviders);
          return (
            <AdminOnlineMetricTile
              key="admin-registered-providers"
              href="/admin/providers"
              count={metricCounts.registeredProviders}
              tone={photoTone}
              lines={[
                t("home.registeredProvidersLine1"),
                t("home.registeredProvidersLine2"),
              ]}
              ariaLabel={t("home.registeredProvidersAria", { count: display })}
            />
          );
        }

        if (showAdminOnlineTiles && index === totalOrdersReplaceIndex) {
          const display =
            metricCounts.totalOrders === null
              ? "—"
              : String(metricCounts.totalOrders);
          return (
            <AdminOnlineMetricTile
              key="admin-total-orders"
              href="/admin/orders"
              count={metricCounts.totalOrders}
              tone={legalTone}
              lines={[
                t("home.totalOrdersLine1"),
                t("home.totalOrdersLine2"),
              ]}
              ariaLabel={t("home.totalOrdersAria", { count: display })}
            />
          );
        }

        if (showAdminOnlineTiles && index === completedOrdersReplaceIndex) {
          const display =
            metricCounts.completedOrders === null
              ? "—"
              : String(metricCounts.completedOrders);
          return (
            <AdminOnlineMetricTile
              key="admin-completed-orders"
              href="/admin/orders?tab=completed"
              count={metricCounts.completedOrders}
              tone={otherTone}
              lines={[
                t("home.completedOrdersLine1"),
                t("home.completedOrdersLine2"),
              ]}
              ariaLabel={t("home.completedOrdersAria", { count: display })}
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
