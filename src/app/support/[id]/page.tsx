"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { isDemoMode } from "@/lib/config";
import type { AdminSupportTicketDetail } from "@/lib/support/types";
import { cn } from "@/lib/utils";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

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

export default function UserSupportThreadPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { user, ready, profileReady, isPlatformAdmin } = useAuth();
  const [message, setMessage] = useState<AdminSupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!ready || !profileReady) return;
    if (isPlatformAdmin || isDemoMode()) {
      router.replace(id ? `/admin/support/${id}` : "/admin/support");
    }
  }, [ready, profileReady, isPlatformAdmin, router, id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/support/messages/${id}`);
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
    if (isPlatformAdmin || isDemoMode()) return;
    if (!user) {
      router.replace(`/login?redirect=/support/${id ?? ""}`);
      return;
    }
    void load();
  }, [ready, profileReady, isPlatformAdmin, user, router, id, load]);

  const onReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await authFetch(`/api/support/messages/${id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: reply.trim(),
          language: locale === "en" ? "en" : "ru",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(
          typeof data.error === "string" ? data.error : t("support.sendError")
        );
        return;
      }
      setReply("");
      await load();
    } catch {
      setError(t("support.sendError"));
    } finally {
      setSending(false);
    }
  };

  if (!ready || !profileReady) return null;
  if (isPlatformAdmin || isDemoMode()) return null;

  return (
    <AppLayout hideNav title={t("support.threadTitle")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={message?.subject ?? t("support.threadTitle")}
          subtitle={t("support.myRequests")}
          backHref="/support"
        />

        {loading ? (
          <p className="text-sm text-text-muted">{t("common.loading")}</p>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}

        {message ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                {t(`admin.supportStatus.${message.status}`)}
              </span>
              <span className="text-xs text-text-muted">
                {formatWhen(message.created_at, locale)}
              </span>
            </div>

            <Card padding="md" className="space-y-3">
              {(message.thread?.length
                ? message.thread
                : [
                    {
                      id: "legacy",
                      ticket_id: message.id,
                      sender_type: "user" as const,
                      sender_user_id: message.user_id,
                      message: message.message,
                      language: message.language,
                      created_at: message.created_at,
                    },
                  ]
              ).map((item) => {
                const fromAdmin = item.sender_type === "admin";
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-xl px-3 py-2.5 text-sm",
                      fromAdmin
                        ? "bg-brand-50 text-text-primary"
                        : "bg-slate-50 text-text-primary"
                    )}
                  >
                    <p className="mb-1 text-xs font-medium text-text-muted">
                      {fromAdmin ? t("support.fromAdmin") : t("support.fromUser")}
                      {" · "}
                      {formatWhen(item.created_at, locale)}
                    </p>
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {item.message}
                    </p>
                  </div>
                );
              })}
            </Card>

            {message.status !== "closed" ? (
              <Card padding="md">
                <form onSubmit={(e) => void onReply(e)} className="space-y-3">
                  <Textarea
                    id="user-support-reply"
                    label={t("support.message")}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={4}
                    maxLength={5000}
                    placeholder={t("support.replyPlaceholder")}
                    required
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    loading={sending}
                    disabled={!reply.trim()}
                  >
                    {t("support.sendReply")}
                  </Button>
                </form>
              </Card>
            ) : (
              <p className="text-sm text-text-muted">{t("support.closedNotice")}</p>
            )}
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}
