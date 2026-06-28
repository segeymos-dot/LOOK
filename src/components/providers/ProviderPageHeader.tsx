"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";

export function ProviderPageHeader() {
  const { t } = useTranslation();
  return (
    <PageHeader
      title={t("provider.pageTitle")}
      backHref="/search"
      className="px-4 pt-4"
    />
  );
}
