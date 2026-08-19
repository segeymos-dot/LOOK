"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { LEGAL_OPERATOR } from "@/lib/legal/operator";
import type { PrivacySection } from "@/lib/legal/privacy-content";
import { useSearchParams } from "next/navigation";
import { ReactNode, Suspense } from "react";

export function legalBackHref(from: string | null): string {
  if (from === "register") return "/register";
  if (from === "settings") return "/settings";
  if (from === "settings-legal") return "/settings/legal";
  if (from === "legal-accept") return "/legal/accept";
  return "/";
}

function OperatorBlock({ placeholder }: { placeholder: string }) {
  const { t } = useTranslation();
  const line = (value: string | null) => value?.trim() || placeholder;

  return (
    <section className="space-y-2 rounded-xl border border-border-subtle bg-surface-muted/40 px-3 py-3">
      <h2 className="text-base font-semibold text-text-primary">
        {t("legal.operatorBlockTitle")}
      </h2>
      <p>
        <strong>{t("legal.operatorName")}</strong> {line(LEGAL_OPERATOR.legalName)}
      </p>
      <p>
        <strong>{t("legal.operatorReg")}</strong>{" "}
        {line(LEGAL_OPERATOR.registrationNumber)}
      </p>
      <p>
        <strong>{t("legal.operatorAddress")}</strong> {line(LEGAL_OPERATOR.address)}
      </p>
      <p>
        <strong>{t("legal.operatorLegalEmail")}</strong>{" "}
        {LEGAL_OPERATOR.legalEmail ? (
          <a href={`mailto:${LEGAL_OPERATOR.legalEmail}`} className="text-brand-600">
            {LEGAL_OPERATOR.legalEmail}
          </a>
        ) : (
          placeholder
        )}
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
        {line(LEGAL_OPERATOR.paymentProvider)}
      </p>
      <p>
        <strong>{t("legal.applicableLawLabel")}</strong>{" "}
        {line(LEGAL_OPERATOR.applicableLaw)}
      </p>
      <p>
        <strong>{t("legal.disputeVenueLabel")}</strong>{" "}
        {line(LEGAL_OPERATOR.disputeVenue)}
      </p>
    </section>
  );
}

export function LegalSections({ sections }: { sections: readonly PrivacySection[] }) {
  return (
    <>
      {sections.map((section) => (
        <section key={section.title} className="space-y-2">
          {section.title !== "intro" ? (
            <h2 className="text-base font-semibold text-text-primary">
              {section.title}
            </h2>
          ) : null}
          {section.lead ? <p>{section.lead}</p> : null}
          {section.paragraphs?.map((p) => (
            <p key={p.slice(0, 64)}>{p}</p>
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
    </>
  );
}

type LegalDocumentShellProps = {
  title: string;
  subtitle: string;
  version: string;
  effectiveDate: string;
  lastUpdated: string;
  showOperator?: boolean;
  children?: ReactNode;
  sections?: readonly PrivacySection[];
};

function LegalDocumentBody({
  title,
  subtitle,
  version,
  effectiveDate,
  lastUpdated,
  showOperator = true,
  children,
  sections,
}: LegalDocumentShellProps) {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const backHref = legalBackHref(searchParams.get("from"));
  const placeholder = t("legal.placeholderPending");

  return (
    <AppLayout hideNav title={title}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader title={title} subtitle={subtitle} backHref={backHref} />

        <div className="prose prose-sm max-w-none space-y-4 text-sm text-text-secondary">
          <p>
            <strong>{t("legal.effectiveDate")}</strong> {effectiveDate}
          </p>
          <p>
            <strong>{t("legal.lastUpdated")}</strong> {lastUpdated}
          </p>
          <p>
            <strong>{t("legal.documentVersion")}</strong> {version}
          </p>

          {showOperator ? <OperatorBlock placeholder={placeholder} /> : null}
          {sections ? <LegalSections sections={sections} /> : null}
          {children}
        </div>
      </div>
    </AppLayout>
  );
}

export function LegalDocumentShell(props: LegalDocumentShellProps) {
  return (
    <Suspense fallback={null}>
      <LegalDocumentBody {...props} />
    </Suspense>
  );
}
