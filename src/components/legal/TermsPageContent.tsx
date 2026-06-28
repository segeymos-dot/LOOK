"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";

export function TermsPageContent() {
  const { t } = useTranslation();

  return (
    <AppLayout hideNav title={t("legal.termsLink")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("legal.termsLink")}
          subtitle={t("legal.termsSubtitle")}
          backHref="/"
        />

        <div className="prose prose-sm max-w-none space-y-4 text-sm text-text-secondary">
          <p>
            <strong>{t("legal.effectiveDate")}</strong> {t("legal.effectiveDateValue")}
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
            <a href="mailto:support@look.app" className="text-brand-600">
              support@look.app
            </a>
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
