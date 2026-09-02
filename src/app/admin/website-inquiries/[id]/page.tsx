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
import type {
  WebsiteInquiry,
  WebsiteInquiryReply,
} from "@/lib/admin/website-inquiries";
import { useAdminWebsiteInquiriesUnreadCount } from "@/hooks/useAdminWebsiteInquiriesUnreadCount";
import { cn } from "@/lib/utils";
import Link from "next/link";
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

export default function AdminWebsiteInquiryDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { isPlatformAdmin, ready, profileReady } = useAuth();
  const demo = isDemoMode();
  const { refresh: refreshUnread } = useAdminWebsiteInquiriesUnreadCount(true);

  const [inquiry, setInquiry] = useState<WebsiteInquiry | null>(null);
  const [replies, setReplies] = useState<WebsiteInquiryReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(
        `/api/admin/website-inquiries/${encodeURIComponent(id)}?mark_read=true`
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("common.error"));
        return;
      }
      setInquiry(data.inquiry ?? null);
      setReplies(Array.isArray(data.replies) ? data.replies : []);
      void refreshUnread();
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [id, t, refreshUnread]);

  useEffect(() => {
    if (!ready || !profileReady) return;
    if (!isPlatformAdmin && !demo) {
      router.replace("/profile");
      return;
    }
    void load();
  }, [ready, profileReady, isPlatformAdmin, demo, router, load]);

  async function onReply() {
    if (!id || !reply.trim() || sending) return;
    setSending(true);
    setSuccess(null);
    setError(null);
    try {
      const res = await authFetch(
        `/api/admin/website-inquiries/${encodeURIComponent(id)}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: reply.trim(),
            locale: locale === "en" ? "en" : "ru",
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("admin.websiteInquiryReplyError"));
        return;
      }
      setInquiry(data.inquiry ?? inquiry);
      setReply("");
      setSuccess(t("admin.websiteInquiryReplySent"));
      void load();
    } catch {
      setError(t("admin.websiteInquiryReplyError"));
    } finally {
      setSending(false);
    }
  }

  if (!ready || !profileReady) return null;
  if (!isPlatformAdmin && !demo) return null;

  const status = inquiry?.status || "new";

  return (
    <AppLayout hideNav title={t("admin.websiteInquiriesTitle")}>
      <div className="space-y-5 p-4 pb-8" data-testid="admin-website-inquiry-detail">
        <PageHeader
          title={t("admin.websiteInquiryDetailTitle")}
          subtitle={t("admin.websiteInquiriesTitle")}
        />
        <div className="-mt-2">
          <Link
            href="/admin/website-inquiries"
            className="text-sm text-brand-700 underline-offset-2 hover:underline"
          >
            ← {t("admin.websiteInquiriesTitle")}
          </Link>
        </div>
        <AdminSectionNav activeHref="/admin/website-inquiries" />

        {loading ? (
          <p className="text-sm text-text-secondary">{t("common.loading")}</p>
        ) : error && !inquiry ? (
          <Card className="p-4 text-sm text-red-700">{error}</Card>
        ) : !inquiry ? (
          <Card className="p-4 text-sm">{t("common.error")}</Card>
        ) : (
          <>
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                    status === "answered"
                      ? "bg-emerald-100 text-emerald-800"
                      : status === "new"
                        ? "bg-red-600 text-white"
                        : "bg-surface-muted text-text-secondary"
                  )}
                >
                  {t(`admin.websiteInquiryStatus.${status === "new" || status === "read" || status === "answered" || status === "closed" ? status : "read"}`)}
                </span>
                <span className="text-xs text-text-muted">
                  {formatWhen(inquiry.created_at, locale)}
                </span>
              </div>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-text-secondary">
                    {t("admin.websiteInquiryName")}:{" "}
                  </span>
                  {inquiry.name || "—"}
                </p>
                <p>
                  <span className="text-text-secondary">
                    {t("admin.websiteInquiryEmail")}:{" "}
                  </span>
                  {inquiry.email ? (
                    <a
                      className="text-brand-700 underline-offset-2 hover:underline"
                      href={`mailto:${inquiry.email}`}
                    >
                      {inquiry.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </p>
                <p>
                  <span className="text-text-secondary">
                    {t("admin.websiteInquirySubject")}:{" "}
                  </span>
                  {inquiry.subject || t("admin.websiteInquiriesNoSubject")}
                </p>
              </div>
              <div className="rounded-lg bg-surface-muted p-3 text-sm whitespace-pre-wrap">
                {inquiry.message}
              </div>
            </Card>

            {replies.length > 0 ? (
              <Card className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">
                  {t("admin.websiteInquiryReplies")}
                </h2>
                <ul className="space-y-3">
                  {replies.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-lg border border-border-subtle p-3 text-sm whitespace-pre-wrap"
                    >
                      <p className="mb-1 text-[11px] text-text-muted">
                        {formatWhen(r.created_at, locale)}
                      </p>
                      {r.message}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Card className="space-y-3 p-4">
              <h2 className="text-sm font-semibold">
                {t("admin.websiteInquiryReplyTitle")}
              </h2>
              <textarea
                className="min-h-[120px] w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={t("admin.websiteInquiryReplyPlaceholder")}
                maxLength={5000}
              />
              {error ? (
                <p className="text-sm text-red-700">{error}</p>
              ) : null}
              {success ? (
                <p className="text-sm text-emerald-700">{success}</p>
              ) : null}
              <Button
                type="button"
                onClick={() => void onReply()}
                disabled={sending || !reply.trim()}
              >
                {sending
                  ? t("common.loading")
                  : t("admin.websiteInquirySendReply")}
              </Button>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
