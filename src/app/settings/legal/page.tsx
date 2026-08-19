"use client";

import { SettingsLinkRow, SettingsShell } from "@/components/settings/SettingsShell";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/components/providers/LocaleProvider";
import {
  CURRENT_LICENSES_VERSION,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  LEGAL_LAST_UPDATED,
} from "@/lib/legal/versions";

function formatAccepted(iso: string | null | undefined, locale: string) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

export default function SettingsLegalPage() {
  const { t, locale } = useTranslation();
  const { profile } = useAuth();

  const termsAccepted = formatAccepted(profile?.terms_accepted_at, locale);
  const privacyAccepted = formatAccepted(profile?.privacy_accepted_at, locale);
  const licensesAccepted = formatAccepted(
    profile?.licenses_acknowledged_at,
    locale
  );

  return (
    <SettingsShell
      title={t("legal.settingsLegalTitle")}
      subtitle={t("legal.settingsLegalDesc")}
      backHref="/settings"
    >
      <div className="space-y-3 text-sm text-text-secondary">
        <p>
          {t("legal.lastUpdated")} {LEGAL_LAST_UPDATED}
        </p>
        {termsAccepted ? (
          <p>
            {t("legal.youAcceptedTerms", {
              version: profile?.terms_version ?? CURRENT_TERMS_VERSION,
              date: termsAccepted,
            })}
          </p>
        ) : null}
        {privacyAccepted ? (
          <p>
            {t("legal.youAcceptedPrivacy", {
              version: profile?.privacy_version ?? CURRENT_PRIVACY_VERSION,
              date: privacyAccepted,
            })}
          </p>
        ) : null}
        {licensesAccepted ? (
          <p>
            {t("legal.youAcceptedLicenses", {
              version: profile?.licenses_version ?? CURRENT_LICENSES_VERSION,
              date: licensesAccepted,
            })}
          </p>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        <SettingsLinkRow
          href="/terms?from=settings-legal"
          title={t("legal.termsLink")}
          description={`${t("legal.documentVersion")} ${CURRENT_TERMS_VERSION}`}
        />
        <SettingsLinkRow
          href="/privacy?from=settings-legal"
          title={t("legal.privacyLink")}
          description={`${t("legal.documentVersion")} ${CURRENT_PRIVACY_VERSION}`}
        />
        <SettingsLinkRow
          href="/licenses?from=settings-legal"
          title={t("legal.licensesLink")}
          description={`${t("legal.documentVersion")} ${CURRENT_LICENSES_VERSION}`}
        />
      </div>
    </SettingsShell>
  );
}
