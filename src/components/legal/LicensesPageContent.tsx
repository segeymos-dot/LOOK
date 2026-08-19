"use client";

import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";
import { useTranslation } from "@/components/providers/LocaleProvider";
import {
  CURRENT_LICENSES_VERSION,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
} from "@/lib/legal/versions";
import notices from "@/lib/legal/third-party-notices.json";
import { useState } from "react";

type NoticePackage = (typeof notices.packages)[number];

function PackageCard({ pkg }: { pkg: NoticePackage }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-border-subtle bg-surface-muted/30 px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-text-primary">{pkg.name}</h3>
        <span className="text-xs text-text-muted">v{pkg.version}</span>
      </div>
      <p className="mt-1 text-sm text-text-secondary">
        <strong>License:</strong> {pkg.license}
      </p>
      {pkg.homepage || pkg.repository ? (
        <p className="mt-1 break-all text-xs text-text-muted">
          {pkg.homepage || pkg.repository}
        </p>
      ) : null}
      {pkg.licenseText ? (
        <div className="mt-2">
          <button
            type="button"
            className="text-sm font-semibold text-brand-600"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide license text" : "Show license text"}
          </button>
          {open ? (
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface px-3 py-2 text-[11px] leading-snug text-text-secondary">
              {pkg.licenseText}
            </pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function LicensesPageContent() {
  const { t } = useTranslation();

  return (
    <LegalDocumentShell
      title={t("legal.licensesLink")}
      subtitle={t("legal.licensesSubtitle")}
      version={CURRENT_LICENSES_VERSION}
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      lastUpdated={LEGAL_LAST_UPDATED}
      showOperator={false}
    >
      <p>{t("legal.licensesIntro")}</p>
      <p className="text-xs text-text-muted">
        {t("legal.licensesGeneratedAt")}: {notices.generatedAt}
      </p>
      <p className="text-xs text-text-muted">{notices.note}</p>
      <div className="space-y-3">
        {notices.packages.map((pkg) => (
          <PackageCard key={`${pkg.name}@${pkg.version}`} pkg={pkg} />
        ))}
      </div>
    </LegalDocumentShell>
  );
}
