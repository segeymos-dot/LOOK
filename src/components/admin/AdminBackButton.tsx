"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { cn } from "@/lib/utils";

const DEFAULT_FALLBACK = "/admin/stats";

function hasUsableAppHistory(): boolean {
  if (typeof window === "undefined") return false;

  const state = window.history.state as { idx?: number } | null;
  if (typeof state?.idx === "number") {
    return state.idx > 0;
  }

  try {
    if (document.referrer) {
      const ref = new URL(document.referrer);
      if (ref.origin === window.location.origin) return true;
    }
  } catch {
    // ignore invalid referrer
  }

  return false;
}

export function AdminBackButton({
  fallbackHref = DEFAULT_FALLBACK,
  /** When set, always navigate here (stable parent). Skips history.back(). */
  href,
  className,
}: {
  fallbackHref?: string;
  href?: string;
  className?: string;
}) {
  const router = useRouter();
  const { t } = useTranslation();

  const onBack = useCallback(() => {
    if (href) {
      router.push(href);
      return;
    }
    if (hasUsableAppHistory()) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }, [fallbackHref, href, router]);

  const label = t("common.back");

  return (
    <button
      type="button"
      onClick={onBack}
      aria-label={label}
      className={cn(
        "inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center gap-1 rounded-xl px-2.5 text-sm font-semibold",
        "text-text-secondary outline-none transition-colors",
        "hover:bg-brand-50 hover:text-brand-700 active:bg-brand-50",
        "focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        className
      )}
    >
      <ChevronLeft className="h-5 w-5 shrink-0" aria-hidden />
      <span>{label}</span>
    </button>
  );
}
