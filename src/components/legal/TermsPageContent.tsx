"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";
import {
  LEGAL_DOCUMENT_VERSION,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
} from "@/lib/legal/versions";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function TermsBody() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const backHref =
    from === "register"
      ? "/register"
      : from === "settings"
        ? "/settings"
        : from === "legal-accept"
          ? "/legal/accept"
          : "/";

  return (
    <AppLayout hideNav title={t("legal.termsLink")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("legal.termsLink")}
          subtitle={t("legal.termsSubtitle")}
          backHref={backHref}
        />

        <div className="prose prose-sm max-w-none space-y-4 text-sm text-text-secondary">
          <p>
            <strong>{t("legal.effectiveDate")}</strong> {LEGAL_EFFECTIVE_DATE}
          </p>
          <p>
            <strong>{t("legal.lastUpdated")}</strong> {LEGAL_LAST_UPDATED}
          </p>
          <p>
            <strong>{t("legal.documentVersion")}</strong> {LEGAL_DOCUMENT_VERSION}
          </p>
          <p>{t("legal.termsIntro")}</p>

          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <section key={n} className="space-y-2">
              <h2 className="text-base font-semibold text-text-primary">
                {t(`legal.termsPage.s${n}Title`)}
              </h2>
              {n === 4 ? (
                <ul className="list-disc space-y-1 pl-5">
                  <li>{t("legal.termsPage.s4Item1")}</li>
                  <li>{t("legal.termsPage.s4Item2")}</li>
                  <li>{t("legal.termsPage.s4Item3")}</li>
                </ul>
              ) : (
                <p>{t(`legal.termsPage.s${n}Body`)}</p>
              )}
            </section>
          ))}

          <p>
            {t("legal.contactPrefix")}{" "}
            <span className="text-text-muted">{t("legal.placeholderPending")}</span>
          </p>
        </div>
      </div>
    </AppLayout>
  );
}

export function TermsPageContent() {
  return (
    <Suspense fallback={null}>
      <TermsBody />
    </Suspense>
  );
}
