"use client";

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

interface HomeHeroCardProps {
  href: string;
  title: string;
  subtitle: string;
}

const HERO_SURFER_IMAGE =
  "/assets/home/IMAGE_2026-07-23_15_38_11-01a46194-d822-41b5-9686-25bbf25bc34b.png";

/**
 * Create-order (or role-specific) Home banner.
 * Surfer photograph fills the card; Plus left of text; Arrow right of surfer.
 */
export function HomeHeroCard({ href, title, subtitle }: HomeHeroCardProps) {
  const plusControl = (
    <span className="relative z-[1] flex h-[104px] w-[104px] shrink-0 items-center justify-center rounded-2xl bg-white shadow-[0_6px_16px_rgba(15,23,42,0.12)]">
      <Plus
        className="h-14 w-14 text-[#1677F2]"
        strokeWidth={1.5}
        aria-hidden
      />
    </span>
  );

  const arrowControl = (
    <span className="flex h-[132px] w-[132px] shrink-0 items-center justify-center rounded-full bg-white shadow-[0_6px_16px_rgba(15,23,42,0.12)] transition-transform group-hover:translate-x-0.5">
      <ArrowRight
        className="text-[#6B7280]"
        style={{ width: 42, height: 32 }}
        strokeWidth={2.5}
        aria-hidden
      />
    </span>
  );

  return (
    <div
      className="mx-auto w-full max-w-[430px] min-w-0"
      style={{ height: 175, minHeight: 175 }}
    >
      <Link
        href={href}
        className="group relative flex h-full w-full min-w-0 items-center overflow-hidden rounded-2xl p-6 shadow-[0_16px_40px_rgba(15,23,42,0.14)] transition-transform active:scale-[0.99]"
        style={{
          height: 175,
          minHeight: 175,
          maxHeight: 175,
          boxSizing: "border-box",
        }}
      >
        {/* New surfer photograph — fills card, clipped by overflow-hidden + rounded corners */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            backgroundImage: `url('${HERO_SURFER_IMAGE}')`,
            backgroundSize: "cover",
            backgroundPosition: "center center",
            backgroundRepeat: "no-repeat",
          }}
        />
        {/* Subtle left veil for title/description readability only */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(6, 59, 103, 0.45) 0%, rgba(6, 59, 103, 0.22) 38%, rgba(6, 59, 103, 0) 62%)",
          }}
        />

        {/* Existing Plus — left of text; out of flow so text position stays unchanged */}
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

        {/* Title / subtitle — unchanged horizontal position */}
        <span
          className="relative z-[1] min-w-0 flex-1 text-left"
          style={{ paddingLeft: 122 }}
        >
          <span className="block text-[22px] font-bold leading-[1.15] tracking-[-0.02em] text-white">
            {title}
          </span>
          <span
            className="mt-1.5 block font-normal line-clamp-2"
            style={{
              color: "#FFFFFF",
              fontSize: "8px",
              lineHeight: "11px",
              WebkitTextSizeAdjust: "100%",
              textSizeAdjust: "100%",
            }}
          >
            {subtitle}
          </span>
        </span>

        {/* Existing Arrow — between surfer and right edge; vertically centered */}
        <span
          className="absolute z-[1]"
          style={{
            right: 24,
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
