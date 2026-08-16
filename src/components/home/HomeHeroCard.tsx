"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, Plus } from "lucide-react";

interface HomeHeroCardProps {
  href: string;
  /** Default create-order / find-orders banner copy. Unused for `variant="admin"`. */
  title?: string;
  subtitle?: string;
  /**
   * `default` — Plus + title/subtitle + Arrow (customer/provider).
   * `admin` — surfer image + profile-style «Admin panel» button only.
   */
  variant?: "default" | "admin";
  /** Label for the admin CTA (i18n from caller). */
  adminCtaLabel?: string;
}

const HERO_SURFER_IMAGE =
  "/assets/home/IMAGE_2026-07-23_15_38_11-01a46194-d822-41b5-9686-25bbf25bc34b.png";

/**
 * Create-order (or role-specific) Home banner.
 * Surfer photograph fills the card; Plus left of text; Arrow right of surfer.
 * Platform admin: same image, profile-style Admin panel button → /admin/stats.
 */
export function HomeHeroCard({
  href,
  title = "",
  subtitle = "",
  variant = "default",
  adminCtaLabel = "Admin panel",
}: HomeHeroCardProps) {
  // Fixed px only — flex:none prevents Electron width from stretching controls.
  const plusControl = (
    <span
      className="relative z-[1] flex shrink-0 grow-0 items-center justify-center rounded-2xl bg-white shadow-[0_6px_16px_rgba(15,23,42,0.12)]"
      style={{ width: 52, height: 52, flex: "none" }}
    >
      <Plus
        className="h-6 w-6 shrink-0 text-[#1677F2]"
        strokeWidth={1.5}
        aria-hidden
      />
    </span>
  );

  const arrowControl = (
    <span
      className="flex shrink-0 grow-0 items-center justify-center rounded-full bg-white shadow-[0_6px_16px_rgba(15,23,42,0.12)] transition-transform group-hover:translate-x-0.5"
      style={{ width: 48, height: 48, flex: "none" }}
    >
      <ArrowRight
        className="shrink-0 text-[#6B7280]"
        style={{ width: 22, height: 22 }}
        strokeWidth={2.5}
        aria-hidden
      />
    </span>
  );

  const shellClass =
    "relative flex h-full w-full min-w-0 items-center overflow-hidden rounded-2xl p-6 shadow-[0_16px_40px_rgba(15,23,42,0.14)]";
  const shellStyle = {
    height: 175,
    minHeight: 175,
    maxHeight: 175,
    boxSizing: "border-box" as const,
  };

  const backgroundLayers = (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: `url('${HERO_SURFER_IMAGE}')`,
          backgroundSize: "cover",
          backgroundPosition: "92% 50%",
          backgroundRepeat: "no-repeat",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(6, 59, 103, 0.45) 0%, rgba(6, 59, 103, 0.22) 38%, rgba(6, 59, 103, 0) 62%)",
        }}
      />
    </>
  );

  if (variant === "admin") {
    return (
      <div
        className="mx-auto w-full max-w-[430px] min-w-0"
        style={{ height: 175, minHeight: 175 }}
      >
        {/* Non-link shell: only the Admin panel button navigates (never /requests/new). */}
        <div className={shellClass} style={shellStyle}>
          {backgroundLayers}
          <div className="relative z-[1] flex h-full w-full min-w-0 items-center">
            {/* Transparent CTA: no brand fill; nudged ~½ button height below center. */}
            <Link
              href={href}
              className="inline-flex min-h-[48px] w-full max-w-[260px] translate-y-6 items-center justify-center gap-2 rounded-2xl bg-transparent px-4 text-base font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.45)] transition-transform active:scale-[0.98]"
            >
              <BarChart3 className="h-5 w-5 shrink-0 drop-shadow-sm" aria-hidden />
              <span className="truncate">{adminCtaLabel}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mx-auto w-full max-w-[430px] min-w-0"
      style={{ height: 175, minHeight: 175 }}
    >
      <Link
        href={href}
        className={`group ${shellClass} transition-transform active:scale-[0.99]`}
        style={shellStyle}
      >
        {backgroundLayers}

        <span
          className="absolute z-[1]"
          style={{
            left: 24,
            top: "50%",
            transform: "translateY(-50%)",
          }}
        >
          {plusControl}
        </span>

        <span
          className="relative z-[1] min-w-0 shrink-0 grow-0 text-left"
          style={{
            paddingLeft: 96,
            maxWidth: 246,
            flex: "none",
          }}
        >
          <span
            className="block font-bold tracking-[-0.02em] text-white"
            style={{
              fontSize: 19,
              lineHeight: 1.1,
              maxWidth: 150,
            }}
          >
            {title}
          </span>
          <span
            className="mt-1.5 block font-normal line-clamp-3"
            style={{
              color: "#FFFFFF",
              fontSize: 10,
              lineHeight: 1.25,
              maxWidth: 140,
              WebkitTextSizeAdjust: "100%",
              textSizeAdjust: "100%",
            }}
          >
            {subtitle}
          </span>
        </span>

        <span
          className="absolute z-[1]"
          style={{
            right: 16,
            top: "50%",
            transform: "translateY(-50%)",
          }}
        >
          {arrowControl}
        </span>
      </Link>
    </div>
  );
}
