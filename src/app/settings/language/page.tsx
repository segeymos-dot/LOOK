"use client";

import { SettingsShell } from "@/components/settings/SettingsShell";
import { Card } from "@/components/ui/Card";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useTranslation } from "@/components/providers/LocaleProvider";

export default function SettingsLanguagePage() {
  const { t } = useTranslation();

  return (
    <SettingsShell title={t("settings.language.title")}>
      <Card padding="md" className="space-y-3">
        <p className="text-sm text-text-muted">{t("settings.language.hint")}</p>
        <LanguageSwitcher />
      </Card>
    </SettingsShell>
  );
}
