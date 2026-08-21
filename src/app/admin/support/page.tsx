"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { isDemoMode } from "@/lib/config";
import type { AdminSupportTicketListItem } from "@/lib/support/types";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Headphones, RefreshCw } from "lucide-react";

function formatWhen(iso: string, locale: string) {
  try {
    return new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "ru-RU", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function previewText(message: string, max = 140) {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export default function AdminSupportListPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { isPlatformAdmin, ready, profileReady } = useAuth();
  const demo = isDemoMode();
  const [messages, setMessages] = useState<AdminSupportTicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/admin/support");
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("common.error"));
        return;
      }
      setMessages(data.messages ?? []);
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!ready || !profileReady) return;
    if (!isPlatformAdmin && !demo) {
      router.replace("/profile");
      return;
    }
    void load();
  }, [ready, profileReady, isPlatformAdmin, demo, router, load]);

  if (!ready || !profileReady) return null;
  if (!isPlatformAdmin && !demo) return null;

  return (
    <AppLayout hideNav title={t("admin.supportTitle")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("admin.supportTitle")}
          subtitle={t("home.trustSupport")}
          backHref="/profile"
        />

        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1 gap-2"
            loading={loading}
            onClick={() => void load()}
          >
            <RefreshCw className="h-4 w-4" />
            {t("admin.refresh")}
          </Button>
          <Link href="/admin/stats" className="flex-1">
            <Button variant="outline" className="w-full">
              {t("admin.statsTitle")}
            </Button>
          </Link>
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        {!loading && messages.length === 0 ? (
          <Card padding="md" className="text-center text-sm text-text-muted">
            {t("admin.supportEmpty")}
          </Card>
        ) : (
          <div className="space-y-3">
            {messages.map((item) => {
              const displayName =
                item.user?.full_name?.trim() || item.user_id;
              return (
                <Link
                  key={item.id}
                  href={`/admin/support/${item.id}`}
                  className="block"
                >
                  <Card
                    padding="md"
                    className={cn(
                      "space-y-2 transition hover:border-brand-300 hover:bg-brand-50/30",
                      item.unread &&
                        "border-brand-400 bg-brand-50/50 ring-1 ring-brand-200"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Headphones className="h-4 w-4 shrink-0 text-brand-600" />
                        <p className="truncate font-semibold text-text-primary">
                          {item.subject}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {item.unread ? (
                          <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                            {t("admin.supportUnread")}
                          </span>
                        ) : null}
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-text-secondary">
                          {t(`admin.supportStatus.${item.status}`)}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-text-secondary">
                      {displayName}
                      {" · "}
                      {item.user_role === "provider"
                        ? t("role.provider")
                        : t("role.customer")}
                    </p>
                    <p className="line-clamp-2 text-sm text-text-muted">
                      {previewText(item.last_message || item.message)}
                    </p>
                    <p className="text-xs text-text-muted">
                      <span className="font-medium text-text-secondary">
                        {t("admin.supportLastActivity")}:{" "}
                      </span>
                      {formatWhen(
                        item.last_activity_at || item.created_at,
                        locale
                      )}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
