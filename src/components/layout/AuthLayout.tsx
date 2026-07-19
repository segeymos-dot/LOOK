"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { BetaBanner } from "./BetaBanner";
import { DemoBanner } from "./DemoBanner";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useTranslation } from "@/components/providers/LocaleProvider";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  banner?: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer, banner }: AuthLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-surface-muted">
      <BetaBanner />
      <DemoBanner />
      <div className="gradient-brand px-6 pb-16 pt-safe pt-10">
        <div className="mb-3 flex items-start justify-between gap-3">
          <Link href="/" className="inline-block">
            <span className="text-2xl font-extrabold tracking-tight text-white">LOOK</span>
          </Link>
          <LanguageSwitcher compact className="border-white/20 bg-white/10" />
        </div>
        <p className="mt-1 text-sm text-white/70">{t("common.marketplace")}</p>
      </div>

      <div className="-mt-10 flex flex-1 flex-col px-4 pb-8">
        <div className="rounded-2xl border border-border-subtle bg-surface p-6 shadow-elevated">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
            {banner}
          </div>
          {children}
        </div>
        {footer && <div className="mt-6">{footer}</div>}
      </div>
    </div>
  );
}
