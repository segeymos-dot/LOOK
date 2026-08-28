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
import type {
  AdminSupportTicketDetail,
  AdminSupportThreadMessage,
} from "@/lib/support/types";
import { cn } from "@/lib/utils";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

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

function normalizeSender(
  value: unknown
): AdminSupportThreadMessage["sender_type"] {
  return String(value ?? "").toLowerCase() === "admin" ? "admin" : "user";
}

function normalizeThread(
  rows: unknown
): AdminSupportThreadMessage[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const id = String(r.id ?? "");
      const text = String(r.message ?? r.body ?? r.content ?? "");
      if (!id || !text) return null;
      return {
        id,
        ticket_id: String(r.ticket_id ?? ""),
        sender_type: normalizeSender(r.sender_type ?? r.senderType),
        sender_user_id: r.sender_user_id
          ? String(r.sender_user_id)
          : r.senderUserId
            ? String(r.senderUserId)
            : null,
        message: text,
        language: (r.language as AdminSupportThreadMessage["language"]) ?? "ru",
        created_at: String(r.created_at ?? r.createdAt ?? new Date().toISOString()),
      } satisfies AdminSupportThreadMessage;
    })
    .filter((row): row is AdminSupportThreadMessage => row !== null)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
}

function extractThread(payload: {
  thread?: unknown;
  message?: { thread?: unknown; message?: string } | null;
}): AdminSupportThreadMessage[] {
  const top = normalizeThread(payload.thread);
  if (top.length > 0) return top;
  return normalizeThread(payload.message?.thread);
}

/** Always prefer full thread history; legacy ticket.message only if thread empty. */
function displayThread(
  detail: AdminSupportTicketDetail
): AdminSupportThreadMessage[] {
  const fromApi = normalizeThread(detail.thread);
  if (fromApi.length > 0) return fromApi;
  return [
    {
      id: `legacy-${detail.id}`,
      ticket_id: detail.id,
      sender_type: "user",
      sender_user_id: detail.user_id,
      message: detail.message,
      language: detail.language,
      created_at: detail.created_at,
    },
  ];
}

function mergeThreadPreferLonger(
  prev: AdminSupportTicketDetail | null,
  next: AdminSupportTicketDetail
): AdminSupportTicketDetail {
  const prevThread = normalizeThread(prev?.thread);
  const nextThread = normalizeThread(next.thread);
  const thread =
    nextThread.length >= prevThread.length ? nextThread : prevThread;
  return { ...next, thread };
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
  const submittingRef = useRef(false);
  const loadGeneration = useRef(0);

  useEffect(() => {
    if (!ready || !profileReady) return;
    if (isPlatformAdmin || isDemoMode()) {
      router.replace(id ? `/admin/support/${id}` : "/admin/support");
    }
  }, [ready, profileReady, isPlatformAdmin, router, id]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!id) return;
      const gen = ++loadGeneration.current;
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const res = await authFetch(`/api/support/messages/${id}`);
        const data = await res.json();
        if (gen !== loadGeneration.current) return;
        if (!res.ok || !data.success) {
          setError(data.error ?? t("common.error"));
          return;
        }
        const detail = data.message as AdminSupportTicketDetail;
        const thread = extractThread(data);
        setMessage((prev) =>
          mergeThreadPreferLonger(prev, { ...detail, thread })
        );
      } catch {
        if (gen !== loadGeneration.current) return;
        setError(t("common.error"));
      } finally {
        if (gen === loadGeneration.current) setLoading(false);
      }
    },
    [id, t]
  );

  useEffect(() => {
    if (!ready || !profileReady) return;
    if (isPlatformAdmin || isDemoMode()) return;
    if (!user) {
      router.replace(`/login?redirect=/support/${id ?? ""}`);
      return;
    }
    void load();
  }, [ready, profileReady, isPlatformAdmin, user, router, id, load]);

  useEffect(() => {
    if (!ready || !profileReady || !user) return;
    if (isPlatformAdmin || isDemoMode()) return;

    const refresh = () => {
      void load({ silent: true });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", refresh);
    const poll = window.setInterval(refresh, 8_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", refresh);
      window.clearInterval(poll);
    };
  }, [ready, profileReady, user, isPlatformAdmin, load]);

  const onReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !reply.trim() || submittingRef.current || sending) return;
    submittingRef.current = true;
    setSending(true);
    setError(null);
    const text = reply.trim();
    try {
      const res = await authFetch(`/api/support/messages/${id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
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
      setMessage((prev) => {
        if (!prev) return prev;
        const nextThread = [...normalizeThread(prev.thread)];
        if (data.reply) {
          const normalized = normalizeThread([data.reply]);
          for (const row of normalized) {
            if (!nextThread.some((x) => x.id === row.id)) nextThread.push(row);
          }
        }
        return {
          ...prev,
          ...(data.message ?? {}),
          thread: nextThread,
          unread: false,
        };
      });
      await load({ silent: true });
    } catch {
      setError(t("support.sendError"));
    } finally {
      submittingRef.current = false;
      setSending(false);
    }
  };

  if (!ready || !profileReady) return null;
  if (isPlatformAdmin || isDemoMode()) return null;

  const thread = message ? displayThread(message) : [];

  return (
    <AppLayout hideNav title={t("support.threadTitle")}>
      <div
        className="space-y-5 p-4 pb-8"
        data-support-thread-root
        data-support-thread-count={thread.length}
      >
        <PageHeader
          title={message?.subject ?? t("support.threadTitle")}
          subtitle={t("support.myRequests")}
          backHref="/support"
        />

        {loading && !message ? (
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
              <Button
                type="button"
                variant="outline"
                className="ml-auto h-8 px-3 text-xs"
                onClick={() => void load()}
                disabled={loading}
              >
                {t("admin.refresh")}
              </Button>
            </div>

            <Card
              padding="md"
              className="space-y-3"
              data-testid="support-thread-messages"
            >
              {thread.map((item) => {
                const fromAdmin = item.sender_type === "admin";
                return (
                  <div
                    key={item.id}
                    data-testid="support-thread-message"
                    data-sender-type={item.sender_type}
                    className={cn(
                      "rounded-xl px-3 py-2.5 text-sm",
                      fromAdmin
                        ? "bg-brand-50 text-text-primary"
                        : "bg-slate-50 text-text-primary"
                    )}
                  >
                    <p className="mb-1 text-xs font-medium text-text-muted">
                      {fromAdmin
                        ? t("support.fromAdmin")
                        : t("support.fromUser")}
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
                    disabled={!reply.trim() || sending}
                  >
                    {t("support.sendReply")}
                  </Button>
                </form>
              </Card>
            ) : (
              <p className="text-sm text-text-muted">
                {t("support.closedNotice")}
              </p>
            )}
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}
