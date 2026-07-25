"use client";

import { useState, type ReactNode } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type { AdminUserListItem } from "@/lib/admin/directory";
import { useTranslation } from "@/components/providers/LocaleProvider";

export type AdminRecordTab = {
  id: string;
  label: string;
  content: ReactNode;
};

export function AdminRecordShell({
  title,
  backHref,
  activeNavHref,
  overview,
  tabs,
  loading,
  error,
}: {
  title: string;
  backHref: string;
  activeNavHref: string;
  overview: AdminUserListItem | null;
  tabs: AdminRecordTab[];
  loading: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [active, setActive] = useState(tabs[0]?.id ?? "overview");

  return (
    <AppLayout hideNav title={title}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader title={title} backHref={backHref} />
        <AdminSectionNav activeHref={activeNavHref} />

        {loading && <p className="text-sm text-text-muted">{t("common.loading")}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}

        {overview && (
          <Card padding="md">
            <div className="flex items-start gap-3">
              <Avatar src={overview.avatar_url} name={overview.full_name} size="lg" ring />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold text-text-primary">{overview.full_name}</p>
                <p className="truncate text-sm text-text-secondary">
                  {overview.email ?? t("admin.directory.emailUnavailable")}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {overview.role} · {t("admin.directory.statusActive")} ·{" "}
                  {[overview.city, overview.country].filter(Boolean).join(", ") || "—"}
                </p>
              </div>
            </div>
          </Card>
        )}

        {tabs.length > 0 && (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActive(tab.id)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                    active === tab.id
                      ? "bg-brand-600 text-white"
                      : "bg-surface text-text-secondary ring-1 ring-border-subtle"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div>{tabs.find((tab) => tab.id === active)?.content}</div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
