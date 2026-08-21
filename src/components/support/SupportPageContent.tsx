"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { OfficialSiteLink } from "@/components/brand/OfficialSiteLink";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Textarea } from "@/components/ui/Textarea";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { LOOK_OFFICIAL_WEBSITE_URL } from "@/lib/brand/official-site";
import type { AdminSupportTicketListItem } from "@/lib/support/types";
import { cn } from "@/lib/utils";
import { ExternalLink, Headphones, Inbox, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { isDemoMode } from "@/lib/config";

type View = "home" | "compose" | "success";

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

/**
 * LOOK administrative support — separate from customer↔provider chats (/chat).
 */
export function SupportPageContent() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { user, ready, profileReady, isCustomer, isProvider, isPlatformAdmin } =
    useAuth();
  const [view, setView] = useState<View>("home");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<AdminSupportTicketListItem[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !profileReady) return;
    if (isPlatformAdmin || isDemoMode()) {
      router.replace("/admin/support");
    }
  }, [ready, profileReady, isPlatformAdmin, router]);

  const userRole = useMemo(() => {
    if (isProvider && !isCustomer) return "provider" as const;
    if (isCustomer && !isProvider) return "customer" as const;
    if (isProvider) return "provider" as const;
    return "customer" as const;
  }, [isCustomer, isProvider]);

  const loadTickets = useCallback(async () => {
    if (!user) {
      setTickets([]);
      return;
    }
    setTicketsLoading(true);
    setTicketsError(null);
    try {
      const res = await authFetch("/api/support/messages");
      const data = await res.json();
      if (!res.ok || !data.success) {
        setTicketsError(data.error ?? t("common.error"));
        return;
      }
      setTickets(data.messages ?? []);
    } catch {
      setTicketsError(t("common.error"));
    } finally {
      setTicketsLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    if (!ready || !profileReady) return;
    if (isPlatformAdmin || isDemoMode()) return;
    if (view !== "home") return;
    void loadTickets();
  }, [ready, profileReady, isPlatformAdmin, view, loadTickets]);

  const resetForm = () => {
    setSubject("");
    setMessage("");
    setError(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();
    if (!trimmedSubject) {
      setError(t("support.subjectRequired"));
      return;
    }
    if (!trimmedMessage) {
      setError(t("support.messageRequired"));
      return;
    }
    if (!user) {
      setError(t("support.loginRequired"));
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch("/api/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: trimmedSubject,
          message: trimmedMessage,
          userRole,
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
      resetForm();
      setView("success");
      void loadTickets();
    } catch {
      setError(t("support.sendError"));
    } finally {
      setLoading(false);
    }
  };

  if (ready && profileReady && (isPlatformAdmin || isDemoMode())) {
    return null;
  }

  if (view === "compose") {
    return (
      <AppLayout hideNav title={t("support.contactAdmin")}>
        <div className="space-y-5 p-4 pb-8">
          <PageHeader
            title={t("support.contactAdmin")}
            subtitle={t("support.title")}
            backHref="/support"
          />

          {!ready ? (
            <p className="text-sm text-text-muted">{t("common.loading")}</p>
          ) : !user ? (
            <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface px-4 py-5">
              <p className="text-sm text-text-secondary">
                {t("support.loginRequired")}
              </p>
              <Link href="/login?redirect=/support">
                <Button className="w-full">{t("profile.loginBtn")}</Button>
              </Link>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setView("home")}
              >
                {t("common.back")}
              </Button>
            </div>
          ) : (
            <form
              onSubmit={(e) => void onSubmit(e)}
              className="space-y-4 rounded-2xl border border-border-subtle bg-surface px-4 py-5"
            >
              <Input
                id="support-subject"
                label={t("support.subject")}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                required
              />
              <Textarea
                id="support-message"
                label={t("support.message")}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                maxLength={5000}
                required
              />
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button type="submit" className="w-full" loading={loading}>
                {t("support.send")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading}
                onClick={() => {
                  resetForm();
                  setView("home");
                }}
              >
                {t("common.cancel")}
              </Button>
            </form>
          )}
        </div>
      </AppLayout>
    );
  }

  if (view === "success") {
    return (
      <AppLayout hideNav title={t("support.title")}>
        <div className="space-y-5 p-4 pb-8">
          <PageHeader title={t("support.title")} backHref="/support" />
          <div className="space-y-4 rounded-2xl border border-border-subtle bg-surface px-4 py-5">
            <p className="text-sm leading-relaxed text-emerald-700">
              {t("support.sentSuccess")}
            </p>
            <Button
              type="button"
              className="w-full"
              onClick={() => setView("home")}
            >
              {t("common.back")}
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout hideNav title={t("support.title")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("support.title")}
          subtitle={t("home.trustSupport")}
          backHref="/"
        />

        <div className="space-y-4 rounded-2xl border border-border-subtle bg-surface px-4 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Headphones className="h-5 w-5" aria-hidden />
            </div>
            <p className="text-sm leading-relaxed text-text-secondary">
              {t("support.body")}
            </p>
          </div>

          <Button
            type="button"
            className="w-full gap-2"
            onClick={() => {
              resetForm();
              setView("compose");
            }}
          >
            <Mail className="h-4 w-4" aria-hidden />
            {t("support.contactAdmin")}
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-brand-600" aria-hidden />
            <h2 className="font-semibold text-text-primary">
              {t("support.myRequests")}
            </h2>
          </div>

          {!user ? (
            <Card padding="md" className="text-sm text-text-secondary">
              {t("support.loginRequired")}
            </Card>
          ) : ticketsLoading ? (
            <p className="text-sm text-text-muted">{t("common.loading")}</p>
          ) : ticketsError ? (
            <p className="text-sm text-danger">{ticketsError}</p>
          ) : tickets.length === 0 ? (
            <Card padding="md" className="text-sm text-text-muted">
              {t("support.myRequestsEmpty")}
            </Card>
          ) : (
            <div className="space-y-2">
              {tickets.map((item) => (
                <Link
                  key={item.id}
                  href={`/support/${item.id}`}
                  className="block"
                >
                  <Card
                    padding="md"
                    className={cn(
                      "space-y-1.5 transition hover:border-brand-300 hover:bg-brand-50/30",
                      item.unread &&
                        "border-brand-400 bg-brand-50/40 ring-1 ring-brand-200"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-semibold text-text-primary">
                        {item.subject}
                      </p>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-text-secondary">
                        {t(`admin.supportStatus.${item.status}`)}
                      </span>
                    </div>
                    {item.unread ? (
                      <p className="text-xs font-medium text-brand-700">
                        {t("support.adminReply")}
                      </p>
                    ) : null}
                    <p className="text-xs text-text-muted">
                      {formatWhen(
                        item.last_activity_at || item.created_at,
                        locale
                      )}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-2xl border border-border-subtle bg-surface px-4 py-4">
          <p className="font-semibold text-text-primary">
            <OfficialSiteLink showIcon className="font-semibold" />
          </p>
          <a
            href={LOOK_OFFICIAL_WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 break-all text-sm text-brand-600"
          >
            {LOOK_OFFICIAL_WEBSITE_URL}
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
          </a>
        </div>
      </div>
    </AppLayout>
  );
}
