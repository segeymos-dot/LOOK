"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { isDemoMode } from "@/lib/config";
import type { WebsiteInquiry } from "@/lib/admin/website-inquiries";
import { LOOK_OFFICIAL_WEBSITE_URL } from "@/lib/brand/official-site";
import { cn } from "@/lib/utils";
import { Globe2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

function previewText(message: string, max = 140) {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function statusKey(status: string, readAt: string | null) {
  if (status === "answered") return "answered";
  if (status === "closed") return "closed";
  if (status === "read" || readAt) return "read";
  return "new";
}

export default function AdminWebsiteInquiriesPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { isPlatformAdmin, ready, profileReady } = useAuth();
  const demo = isDemoMode();
  const [inquiries, setInquiries] = useState<WebsiteInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/admin/website-inquiries");
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("common.error"));
        return;
      }
      setInquiries(Array.isArray(data.inquiries) ? data.inquiries : []);
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
    <AppLayout hideNav title={t("admin.websiteInquiriesTitle")}>
      <div
        className="space-y-5 p-4 pb-8"
        data-testid="admin-website-inquiries"
      >
        <PageHeader
          title={t("admin.websiteInquiriesTitle")}
          subtitle={t("admin.websiteInquiriesSubtitle")}
        />
        <AdminSectionNav activeHref="/admin/website-inquiries" />

        {loading ? (
          <p className="text-sm text-text-secondary">{t("common.loading")}</p>
        ) : error ? (
          <Card className="p-4 text-sm text-red-700">{error}</Card>
        ) : inquiries.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-text-secondary">
              <Globe2 className="h-6 w-6" aria-hidden />
            </span>
            <p className="text-sm font-medium text-text-primary">
              {t("admin.websiteInquiriesEmpty")}
            </p>
            <p className="max-w-sm text-xs text-text-secondary">
              {t("admin.websiteInquiriesEmptyHint", {
                site: LOOK_OFFICIAL_WEBSITE_URL.replace(/^https?:\/\//, ""),
              })}
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {inquiries.map((item) => {
              const st = statusKey(item.status, item.read_by_admin_at);
              const unread = !item.read_by_admin_at;
              return (
                <li key={item.id}>
                  <Link
                    href={`/admin/website-inquiries/${item.id}`}
                    className="block outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-xl"
                  >
                    <Card
                      className={cn(
                        "space-y-1 p-4 transition-colors hover:bg-surface-muted",
                        unread && "ring-1 ring-brand-500/30"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-text-primary">
                          {item.subject?.trim() ||
                            t("admin.websiteInquiriesNoSubject")}
                        </p>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                            st === "new" && "bg-red-600 text-white",
                            st === "read" && "bg-surface-muted text-text-secondary",
                            st === "answered" && "bg-emerald-100 text-emerald-800",
                            st === "closed" && "bg-surface-muted text-text-muted"
                          )}
                        >
                          {t(`admin.websiteInquiryStatus.${st}`)}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary">
                        {[item.name, item.email].filter(Boolean).join(" · ")}
                      </p>
                      <p className="line-clamp-3 text-sm text-text-primary">
                        {previewText(item.message)}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {formatWhen(item.created_at, locale)}
                      </p>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}
