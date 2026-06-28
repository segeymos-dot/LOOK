"use client";

import { isDemoMode } from "@/lib/config";
import { useTranslation } from "@/components/providers/LocaleProvider";

export function BetaBanner() {
  const { t } = useTranslation();

  if (isDemoMode()) return null;

  return (
    <div className="bg-amber-50 px-4 py-2 text-center text-xs leading-relaxed text-amber-900 sm:text-sm">
      <span className="font-semibold">{t("banner.beta.title")}</span>
      <br />
      {t("banner.beta.paymentsTest")}
    </div>
  );
}
