"use client";

import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { getPrivacySections } from "@/lib/legal/privacy-content";
import {
  CURRENT_PRIVACY_VERSION,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
} from "@/lib/legal/versions";

export function PrivacyPageContent() {
  const { t, locale } = useTranslation();
  return (
    <LegalDocumentShell
      title={t("legal.privacyLink")}
      subtitle={t("legal.privacySubtitle")}
      version={CURRENT_PRIVACY_VERSION}
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      lastUpdated={LEGAL_LAST_UPDATED}
      sections={getPrivacySections(locale)}
    />
  );
}
