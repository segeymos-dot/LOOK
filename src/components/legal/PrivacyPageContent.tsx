"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";

export function PrivacyPageContent() {
  const { t } = useTranslation();

  return (
    <AppLayout hideNav title={t("legal.privacyLink")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("legal.privacyLink")}
          subtitle={t("legal.privacySubtitle")}
          backHref="/"
        />

        <div className="prose prose-sm max-w-none space-y-4 text-sm text-text-secondary">
          <p>
            <strong>{t("legal.effectiveDate")}</strong> {t("legal.effectiveDateValue")}
          </p>
          <p>{t("legal.privacyIntro")}</p>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-text-primary">{t("legal.privacyPage.s1Title")}</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("legal.privacyPage.s1Item1")}</li>
              <li>{t("legal.privacyPage.s1Item2")}</li>
              <li>{t("legal.privacyPage.s1Item3")}</li>
              <li>{t("legal.privacyPage.s1Item4")}</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-text-primary">{t("legal.privacyPage.s2Title")}</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("legal.privacyPage.s2Item1")}</li>
              <li>{t("legal.privacyPage.s2Item2")}</li>
              <li>{t("legal.privacyPage.s2Item3")}</li>
              <li>{t("legal.privacyPage.s2Item4")}</li>
            </ul>
          </section>

          {[3, 4, 5].map((n) => (
            <section key={n} className="space-y-2">
              <h2 className="text-base font-semibold text-text-primary">
                {t(`legal.privacyPage.s${n}Title`)}
              </h2>
              <p>{t(`legal.privacyPage.s${n}Body`)}</p>
            </section>
          ))}

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-text-primary">{t("legal.privacyPage.s6Title")}</h2>
            <p>
              {t("legal.privacyContactPrefix")}{" "}
              <a href="mailto:support@look.app" className="text-brand-600">
                support@look.app
              </a>
            </p>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
