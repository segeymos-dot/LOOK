"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ReactNode } from "react";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { AdminBackButton } from "@/components/admin/AdminBackButton";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Hardcoded previous route (non-admin flows). */
  backHref?: string;
  /** Admin: history.back() with fallback. Does not change customer/provider link backs. */
  historyBack?: boolean;
  backFallbackHref?: string;
  /**
   * Stable admin parent route. When set with historyBack, always navigates here
   * (no history.back) — use when back must land on a known page (e.g. profile).
   */
  historyBackHref?: string;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  historyBack = false,
  backFallbackHref,
  historyBackHref,
  action,
  className,
}: PageHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {historyBack ? (
          <AdminBackButton
            href={historyBackHref}
            fallbackHref={backFallbackHref}
            className="-ml-2.5 mt-0.5"
          />
        ) : backHref ? (
          <Link
            href={backHref}
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-text-secondary shadow-card transition-colors hover:bg-brand-50 hover:text-brand-600"
            aria-label={t("common.back")}
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-text-primary">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-text-secondary">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
