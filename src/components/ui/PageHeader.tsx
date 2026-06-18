import { cn } from "@/lib/utils";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, backHref, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {backHref && (
          <Link
            href={backHref}
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-text-secondary shadow-card transition-colors hover:bg-brand-50 hover:text-brand-600"
            aria-label="Назад"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        )}
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
