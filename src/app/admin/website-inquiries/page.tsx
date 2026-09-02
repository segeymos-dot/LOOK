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
import { Globe2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function AdminWebsiteInquiriesPage() {
  const router = useRouter();
  const { t } = useTranslation();
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
            {inquiries.map((item) => (
              <li key={item.id}>
                <Card className="space-y-1 p-4">
                  <p className="text-sm font-semibold text-text-primary">
                    {item.subject?.trim() || t("admin.websiteInquiriesNoSubject")}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {[item.name, item.email].filter(Boolean).join(" · ")}
                  </p>
                  <p className="line-clamp-3 text-sm text-text-primary">
                    {item.message}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}
