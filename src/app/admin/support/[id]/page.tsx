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

export default function AdminSupportDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { isPlatformAdmin, ready, profileReady } = useAuth();
  const demo = isDemoMode();
  const [message, setMessage] = useState<AdminSupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(
        `/api/admin/support/${id}`,
        {},
        { timeoutMs: 15000 }
      );
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

  const onReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !reply.trim()) return;
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await authFetch(
        `/api/admin/support/${id}/replies`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: reply.trim(),
            language: locale === "en" ? "en" : "ru",
          }),
        },
        { timeoutMs: 20000 }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(
          typeof data.error === "string"
            ? data.error
            : t("admin.supportReplyError")
        );
        return;
      }

      setReply("");
      setSuccess(t("admin.supportReplySent"));
      setMessage((prev) => {
        if (!prev) return prev;
        const nextThread = [...(prev.thread ?? [])];
        if (data.reply) nextThread.push(data.reply);
        return {
          ...prev,
          ...(data.message ?? {}),
          status: data.message?.status ?? "answered",
          thread: nextThread,
          unread: false,
        };
      });
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t("admin.supportReplyError")
      );
    } finally {
      setSending(false);
    }
  };

  const onClose = async () => {
    if (!id) return;
    setClosing(true);
    setError(null);
    try {
      const res = await authFetch(`/api/admin/support/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error ?? t("common.error"));
        return;
      }
      await load();
    } catch {
      setError(t("common.error"));
    } finally {
      setClosing(false);
    }
  };

  if (!ready || !profileReady) return null;
  if (!isPlatformAdmin && !demo) return null;

  const displayName =
    message?.user?.full_name?.trim() || message?.user_id || "";

  return (
    <AppLayout hideNav title={t("admin.supportTitle")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("admin.supportDetailTitle")}
          subtitle={t("home.trustSupport")}
          backHref="/admin/support"
        />

        {loading ? (
          <p className="text-sm text-text-muted">{t("common.loading")}</p>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {success ? (
          <p className="text-sm text-emerald-700">{success}</p>
        ) : null}

        {message ? (
          <>
            <Card padding="md" className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                  {t(`admin.supportStatus.${message.status}`)}
                </span>
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
                  <span className="text-text-muted">
                    {t("admin.supportUser")}:{" "}
                  </span>
                  {displayName}
                </p>
                <p className="break-all">
                  <span className="text-text-muted">
                    {t("admin.supportUserId")}:{" "}
                  </span>
                  {message.user_id}
                </p>
                {message.user?.email ? (
                  <p>
                    <span className="text-text-muted">
                      {t("admin.supportEmail")}:{" "}
                    </span>
                    {message.user.email}
                  </p>
                ) : null}
                {message.user?.registered_at ? (
                  <p>
                    <span className="text-text-muted">
                      {t("admin.supportRegistered")}:{" "}
                    </span>
                    {formatWhen(message.user.registered_at, locale)}
                  </p>
                ) : null}
                <p>
                  <span className="text-text-muted">
                    {t("admin.supportRole")}:{" "}
                  </span>
                  {message.user_role === "provider"
                    ? t("role.provider")
                    : t("role.customer")}
                </p>
                <p>
                  <span className="text-text-muted">
                    {t("admin.supportWhen")}:{" "}
                  </span>
                  {formatWhen(message.created_at, locale)}
                </p>
              </div>
            </Card>

            <Card padding="md" className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                {t("support.threadTitle")}
              </p>
              <div className="space-y-3">
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
                        {fromAdmin
                          ? t("admin.supportFromAdmin")
                          : t("admin.supportFromUser")}
                        {" · "}
                        {formatWhen(item.created_at, locale)}
                      </p>
                      <p className="whitespace-pre-wrap leading-relaxed">
                        {item.message}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>

            {message.status !== "closed" ? (
              <Card padding="md">
                <form
                  onSubmit={(e) => void onReply(e)}
                  className="space-y-3"
                >
                  <p className="font-semibold text-text-primary">
                    {t("admin.supportReplyTitle")}
                  </p>
                  <Textarea
                    id="admin-support-reply"
                    label={t("admin.supportReplyMessage")}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={5}
                    maxLength={5000}
                    required
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    loading={sending}
                    disabled={!reply.trim()}
                  >
                    {t("admin.supportSendReply")}
                  </Button>
                </form>
              </Card>
            ) : (
              <p className="text-sm text-text-muted">{t("support.closedNotice")}</p>
            )}

            <div className="flex flex-col gap-2">
              {message.status !== "closed" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  loading={closing}
                  onClick={() => void onClose()}
                >
                  {t("admin.supportClose")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/support")}
              >
                {t("common.back")}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}
