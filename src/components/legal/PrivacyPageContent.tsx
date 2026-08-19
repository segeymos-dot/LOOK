"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { LEGAL_OPERATOR } from "@/lib/legal/operator";
import { getPrivacySections } from "@/lib/legal/privacy-content";
import {
  LEGAL_DOCUMENT_VERSION,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
} from "@/lib/legal/versions";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function PrivacyBody() {
  const { t, locale } = useTranslation();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const backHref =
    from === "register"
      ? "/register"
      : from === "settings"
        ? "/settings"
        : "/";

  const sections = getPrivacySections(locale);
  const placeholder = t("legal.placeholderPending");

  const operatorLine = (value: string | null) => value?.trim() || placeholder;

  return (
    <AppLayout hideNav title={t("legal.privacyLink")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("legal.privacyLink")}
          subtitle={t("legal.privacySubtitle")}
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

          <section className="space-y-2 rounded-xl border border-border-subtle bg-surface-muted/40 px-3 py-3">
            <h2 className="text-base font-semibold text-text-primary">
              {t("legal.operatorBlockTitle")}
            </h2>
            <p>
              <strong>{t("legal.operatorName")}</strong>{" "}
              {operatorLine(LEGAL_OPERATOR.legalName)}
            </p>
            <p>
              <strong>{t("legal.operatorReg")}</strong>{" "}
              {operatorLine(LEGAL_OPERATOR.registrationNumber)}
            </p>
            <p>
              <strong>{t("legal.operatorAddress")}</strong>{" "}
              {operatorLine(LEGAL_OPERATOR.address)}
            </p>
            <p>
              <strong>{t("legal.operatorPrivacyEmail")}</strong>{" "}
              {LEGAL_OPERATOR.privacyEmail ? (
                <a
                  href={`mailto:${LEGAL_OPERATOR.privacyEmail}`}
                  className="text-brand-600"
                >
                  {LEGAL_OPERATOR.privacyEmail}
                </a>
              ) : (
                placeholder
              )}
            </p>
            <p>
              <strong>{t("legal.operatorSupportEmail")}</strong>{" "}
              {LEGAL_OPERATOR.supportEmail ? (
                <a
                  href={`mailto:${LEGAL_OPERATOR.supportEmail}`}
                  className="text-brand-600"
                >
                  {LEGAL_OPERATOR.supportEmail}
                </a>
              ) : (
                placeholder
              )}
            </p>
            <p>
              <strong>{t("legal.paymentProviderLabel")}</strong>{" "}
              {operatorLine(LEGAL_OPERATOR.paymentProvider)}
            </p>
          </section>

          {sections.map((section) => (
            <section key={section.title} className="space-y-2">
              {section.title !== "intro" ? (
                <h2 className="text-base font-semibold text-text-primary">
                  {section.title}
                </h2>
              ) : null}
              {section.lead ? <p>{section.lead}</p> : null}
              {section.paragraphs?.map((p) => (
                <p key={p.slice(0, 48)}>{p}</p>
              ))}
              {section.items ? (
                <ul className="list-disc space-y-1 pl-5">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

export function PrivacyPageContent() {
  return (
    <Suspense fallback={null}>
      <PrivacyBody />
    </Suspense>
  );
}
