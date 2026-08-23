"use client";

import { useTranslation } from "@/components/providers/LocaleProvider";

/** Distinct revision-request callout — never confused with dispute reason. */
export function RevisionRequestNotice({ feedback }: { feedback: string }) {
  const { t } = useTranslation();
  if (!feedback.trim()) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
        {t("request.revisionRequestLabel")}
      </p>
      <p className="whitespace-pre-wrap">{feedback}</p>
    </div>
  );
}
