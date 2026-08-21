"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { OfficialSiteLink } from "@/components/brand/OfficialSiteLink";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { LOOK_OFFICIAL_WEBSITE_URL } from "@/lib/brand/official-site";
import { ExternalLink, Headphones, Mail } from "lucide-react";
import { useState } from "react";

/**
 * LOOK administrative support — separate from customer↔provider chats (/chat).
 * Admin messaging backend is not wired yet; UI reserves a clear slot for it.
 */
export function SupportPageContent() {
  const { t } = useTranslation();
  const [showAdminSlot, setShowAdminSlot] = useState(false);

  return (
    <AppLayout hideNav title={t("support.title")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("support.title")}
          subtitle={t("home.trustSupport")}
          backHref="/"
        />

        <div className="rounded-2xl border border-border-subtle bg-surface px-4 py-5 space-y-4">
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
            onClick={() => setShowAdminSlot(true)}
          >
            <Mail className="h-4 w-4" aria-hidden />
            {t("support.contactAdmin")}
          </Button>

          {showAdminSlot ? (
            <div
              id="admin-support-messaging"
              data-admin-support-slot="pending"
              className="space-y-2 rounded-xl border border-dashed border-border bg-surface-muted/50 px-3 py-3"
              role="status"
            >
              <p className="text-sm font-semibold text-text-primary">
                {t("support.adminSlotTitle")}
              </p>
              <p className="text-sm leading-relaxed text-text-secondary">
                {t("support.adminSlotBody")}
              </p>
              <p className="text-xs text-text-muted">{t("support.adminSlotHint")}</p>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border-subtle bg-surface px-4 py-4 space-y-2">
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
