"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

export function SettingsShell({
  title,
  subtitle,
  backHref = "/settings",
  children,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, ready } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent("/settings")}`);
    }
  }, [ready, user, router]);

  if (!ready) {
    return (
      <AppLayout hideNav title={title}>
        <p className="p-4 text-sm text-text-muted">{t("common.loading")}</p>
      </AppLayout>
    );
  }

  if (!user) return null;

  return (
    <AppLayout hideNav title={title}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader title={title} subtitle={subtitle} backHref={backHref} />
        {children}
      </div>
    </AppLayout>
  );
}

export function SettingsLinkRow({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-border-subtle bg-surface px-4 py-3 transition hover:border-brand-300 hover:bg-brand-50/40"
    >
      <p className="font-semibold text-text-primary">{title}</p>
      <p className="mt-0.5 text-sm text-text-muted">{description}</p>
    </Link>
  );
}
