"use client";

import { isDemoMode } from "@/lib/config";
import { useTranslation } from "@/components/providers/LocaleProvider";

export function DemoBanner() {
  const { t } = useTranslation();

  if (!isDemoMode()) return null;

  return (
    <div className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-800">
      {t("banner.demo.message")}
    </div>
  );
}
