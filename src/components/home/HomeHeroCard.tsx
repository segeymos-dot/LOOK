"use client";

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { useTranslation } from "@/components/providers/LocaleProvider";

interface HomeHeroCardProps {
  href: string;
  title: string;
  subtitle: string;
}

/**
 * Create-order (or role-specific) Home banner.
 * Decorative sea / wave / surfer SVG sits behind foreground content.
 */
export function HomeHeroCard({ href, title, subtitle }: HomeHeroCardProps) {
  const { locale } = useTranslation();
  const showRuCreateOrderLines =
    locale === "ru" && subtitle.trim().startsWith("Опишите");

  return (
    <Link
      href={href}
      className="group relative mx-auto flex h-[190px] w-full max-w-[430px] min-w-0 items-center gap-4 overflow-hidden rounded-[24px] p-6 shadow-[0_16px_40px_rgba(15,23,42,0.14)] transition-transform active:scale-[0.99]"
      style={{
        backgroundImage:
          "linear-gradient(135deg, #063B67 0%, #0A78B8 48%, #20BBD1 100%)",
      }}
    >
      {/* Decorative sea / wave / surfer — background only, clipped by overflow-hidden */}
      <svg
        aria-hidden
        viewBox="0 0 430 190"
        preserveAspectRatio="xMaxYMax slice"
        className="pointer-events-none absolute inset-0 z-0 h-full w-full"
        style={{ opacity: 0.52 }}
      >
        <defs>
          <linearGradient id="heroSurfVeil" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#063B67" stopOpacity="0.35" />
            <stop offset="70%" stopColor="#063B67" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#063B67" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Distant sea band */}
        <path
          fill="#7EC8E3"
          d="M0 118 C70 108 140 126 210 120 C280 114 340 102 430 108 L430 190 L0 190 Z"
        />
        <path
          fill="#5BB4D9"
          d="M0 132 C90 124 160 140 240 134 C320 128 380 118 430 124 L430 190 L0 190 Z"
        />
        {/* Large curling wave — right / lower */}
        <path
          fill="#0A78B8"
          d="M168 190 C210 148 255 112 318 98 C360 90 392 96 430 118 L430 190 Z"
        />
        <path
          fill="#20BBD1"
          d="M200 190 C240 155 278 128 330 116 C368 108 400 116 430 136 L430 190 Z"
        />
        {/* Wave lip / curl */}
        <path
          fill="#F4FDFF"
          d="M292 108 C318 86 348 78 378 88 C398 96 412 112 422 130 C404 118 384 108 360 108 C336 108 312 114 292 108 Z"
        />
        <path
          fill="#B8E6F5"
          d="M308 118 C330 102 356 98 380 108 C396 116 408 128 416 142 C400 130 382 122 360 122 C338 122 320 126 308 118 Z"
        />
        {/* Foam spray lines */}
        <path
          fill="none"
          stroke="#F4FDFF"
          strokeWidth="2"
          strokeLinecap="round"
          d="M340 96 C352 88 366 86 378 92"
        />
        <path
          fill="none"
          stroke="#F4FDFF"
          strokeWidth="1.5"
          strokeLinecap="round"
          d="M352 90 C362 82 374 80 386 86"
        />
        {/* Soft left-side veil so text stays readable */}
        <path
          fill="url(#heroSurfVeil)"
          d="M0 0 H250 C200 40 180 100 200 190 H0 Z"
        />
        {/* Surfer + board — right / mid-lower, riding the face */}
        <g transform="translate(318 98) rotate(-18)">
          {/* Surfboard */}
          <ellipse cx="0" cy="22" rx="22" ry="4.5" fill="#F4FDFF" />
          <ellipse cx="0" cy="21.5" rx="18" ry="2.2" fill="#B8E6F5" />
          {/* Legs */}
          <path
            fill="#E8F7FC"
            d="M-3 8 L-5 20 L-1 20 L1 10 Z M4 9 L3 20 L7 20 L6 9 Z"
          />
          {/* Torso */}
          <rect
            x="-5"
            y="-2"
            width="10"
            height="12"
            rx="3"
            fill="#E8F7FC"
          />
          {/* Arms */}
          <path
            fill="#E8F7FC"
            d="M-5 1 C-12 0 -14 6 -10 8 C-8 9 -6 6 -5 4 Z M5 1 C12 -2 14 4 10 7 C8 8 6 5 5 3 Z"
          />
          {/* Head (no facial detail) */}
          <circle cx="0" cy="-7" r="5" fill="#E8F7FC" />
        </g>
      </svg>

      {/* 1. Plus tile */}
      <span className="relative z-[1] flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[8px] bg-white shadow-[0_6px_16px_rgba(15,23,42,0.12)]">
        <Plus
          className="h-7 w-7 text-[#1677F2]"
          strokeWidth={1.5}
          aria-hidden
        />
      </span>

      {/* 2. Title / subtitle */}
      <span className="relative z-[1] min-w-0 flex-1 text-left">
        <span className="block text-[22px] font-bold leading-[1.15] tracking-[-0.02em] text-white">
          {title}
        </span>
        {showRuCreateOrderLines ? (
          <span
            className="mt-1.5 block font-normal"
            style={{
              color: "#FFFFFF",
              fontSize: "8px",
              lineHeight: "11px",
              WebkitTextSizeAdjust: "100%",
              textSizeAdjust: "100%",
            }}
          >
            <span className="block" style={{ fontSize: "8px", lineHeight: "11px" }}>
              Опишите задачу и получите
            </span>
            <span className="block" style={{ fontSize: "8px", lineHeight: "11px" }}>
              предложения от проверенных
            </span>
            <span className="block" style={{ fontSize: "8px", lineHeight: "11px" }}>
              исполнителей
            </span>
          </span>
        ) : (
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
        )}
      </span>

      {/* 3. Arrow button — oval 1.5× prior 60×55; wider than tall */}
      <span className="relative z-[1] flex h-[82.5px] w-[90px] shrink-0 items-center justify-center rounded-full bg-white shadow-[0_6px_16px_rgba(15,23,42,0.12)] transition-transform group-hover:translate-x-0.5">
        <ArrowRight
          className="text-[#6B7280]"
          style={{ width: 26, height: 20 }}
          strokeWidth={2.5}
          aria-hidden
        />
      </span>
    </Link>
  );
}
