"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SettingsLinkRow, SettingsShell } from "@/components/settings/SettingsShell";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SettingsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signOut, isProvider, isCustomer } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut({ scope: "local" });
      router.replace("/");
      router.refresh();
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  return (
    <SettingsShell
      title={t("settings.title")}
      subtitle={t("settings.subtitle")}
      backHref="/profile"
    >
      <p className="text-sm text-text-secondary">{t("settings.hubHint")}</p>
      <div className="space-y-2">
        <SettingsLinkRow
          href="/settings/personal"
          title={t("settings.sections.personal")}
          description={t("settings.sections.personalDesc")}
        />
        <SettingsLinkRow
          href="/settings/location"
          title={t("settings.sections.location")}
          description={t("settings.sections.locationDesc")}
        />
        <SettingsLinkRow
          href="/settings/contact"
          title={t("settings.sections.contact")}
          description={t("settings.sections.contactDesc")}
        />
        <SettingsLinkRow
          href="/settings/security"
          title={t("settings.sections.security")}
          description={t("settings.sections.securityDesc")}
        />
        <SettingsLinkRow
          href="/settings/language"
          title={t("settings.sections.language")}
          description={t("settings.sections.languageDesc")}
        />
        <SettingsLinkRow
          href="/settings/notifications"
          title={t("settings.sections.notifications")}
          description={t("settings.sections.notificationsDesc")}
        />
        <SettingsLinkRow
          href="/settings/privacy"
          title={t("settings.sections.privacy")}
          description={t("settings.sections.privacyDesc")}
        />
        <SettingsLinkRow
          href="/settings/sessions"
          title={t("settings.sections.sessions")}
          description={t("settings.sections.sessionsDesc")}
        />
        {isProvider && (
          <SettingsLinkRow
            href="/settings/provider"
            title={t("settings.sections.provider")}
            description={t("settings.sections.providerDesc")}
          />
        )}
        {isCustomer && (
          <SettingsLinkRow
            href="/settings/customer"
            title={t("settings.sections.customer")}
            description={t("settings.sections.customerDesc")}
          />
        )}
        <SettingsLinkRow
          href="/settings/legal"
          title={t("legal.settingsLegalTitle")}
          description={t("legal.settingsLegalDesc")}
        />
        <button
          type="button"
          className="block w-full rounded-2xl border border-red-200 bg-red-50/60 px-4 py-3 text-left transition hover:bg-red-50"
          onClick={() => setConfirmOpen(true)}
        >
          <p className="font-semibold text-danger">{t("settings.sections.signOut")}</p>
          <p className="mt-0.5 text-sm text-text-muted">
            {t("settings.sections.signOutDesc")}
          </p>
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t("settings.sessions.signOutThisTitle")}
        body={t("settings.sessions.signOutThisBody")}
        confirmLabel={t("settings.sessions.signOutThis")}
        danger
        loading={loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleSignOut()}
      />
    </SettingsShell>
  );
}
