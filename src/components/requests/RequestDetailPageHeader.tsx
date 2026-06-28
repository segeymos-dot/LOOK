"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";

export function RequestDetailPageHeader() {
  const { t } = useTranslation();
  return <PageHeader title={t("request.title")} backHref="/search" />;
}
