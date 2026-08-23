"use client";

import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { getTermsSections } from "@/lib/legal/terms-content";
import {
  CURRENT_TERMS_VERSION,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
} from "@/lib/legal/versions";

export function TermsPageContent() {
  const { t, locale } = useTranslation();
  return (
    <LegalDocumentShell
      title={t("legal.termsLink")}
      subtitle={t("legal.termsSubtitle")}
      version={CURRENT_TERMS_VERSION}
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      lastUpdated={LEGAL_LAST_UPDATED}
      sections={getTermsSections(locale)}
    />
  );
}
