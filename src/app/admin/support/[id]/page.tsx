"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { isDemoMode } from "@/lib/config";
import type { AdminSupportMessageWithUser } from "@/lib/support/types";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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

export default function AdminSupportDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { isPlatformAdmin, ready, profileReady } = useAuth();
  const demo = isDemoMode();
  const [message, setMessage] = useState<AdminSupportMessageWithUser | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/admin/support/${id}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("common.error"));
        return;
      }
      setMessage(data.message);
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

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
          title={t("admin.supportDetailTitle")}
          subtitle={t("home.trustSupport")}
          backHref="/admin/support"
        />

        <AdminSectionNav activeHref="/admin/support" />

        {loading ? (
          <p className="text-sm text-text-muted">{t("common.loading")}</p>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}

        {message ? (
          <Card
            padding="md"
            className={
              message.status === "new"
                ? "space-y-4 border-brand-400 ring-1 ring-brand-200"
                : "space-y-4"
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              {message.status === "new" ? (
                <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                  {t("admin.supportStatus.new")}
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                  {t(`admin.supportStatus.${message.status}`)}
                </span>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                {t("support.subject")}
              </p>
              <h2 className="text-lg font-semibold text-text-primary">
                {message.subject}
              </h2>
            </div>

            <div className="grid gap-2 text-sm text-text-secondary">
              <p>
                <span className="text-text-muted">{t("admin.supportUser")}: </span>
                {message.user?.full_name?.trim() || message.user_id}
              </p>
              <p>
                <span className="text-text-muted">{t("admin.supportRole")}: </span>
                {message.user_role === "provider"
                  ? t("role.provider")
                  : t("role.customer")}
              </p>
              <p>
                <span className="text-text-muted">{t("admin.supportStatusLabel")}: </span>
                {t(`admin.supportStatus.${message.status}`)}
              </p>
              <p>
                <span className="text-text-muted">{t("admin.supportWhen")}: </span>
                {formatWhen(message.created_at, locale)}
              </p>
              <p>
                <span className="text-text-muted">{t("admin.supportLanguage")}: </span>
                {message.language.toUpperCase()}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                {t("support.message")}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
                {message.message}
              </p>
            </div>

            <p className="text-xs text-text-muted">{t("admin.supportReplyLater")}</p>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => router.push("/admin/support")}
            >
              {t("common.back")}
            </Button>
          </Card>
        ) : null}
      </div>
    </AppLayout>
  );
}
