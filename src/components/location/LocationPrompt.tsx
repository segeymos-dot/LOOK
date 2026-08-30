"use client";

import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { MapPin } from "lucide-react";

type LocationPromptProps = {
  open: boolean;
  loading?: boolean;
  onAllow: () => void;
  onNotNow: () => void;
};

export function LocationPrompt({
  open,
  loading = false,
  onAllow,
  onNotNow,
}: LocationPromptProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-prompt-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-xl">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <MapPin className="h-5 w-5" aria-hidden />
        </div>
        <h2
          id="location-prompt-title"
          className="text-lg font-semibold text-text-primary"
        >
          {t("location.promptTitle")}
        </h2>
        <p className="mt-2 text-sm text-text-secondary whitespace-pre-wrap">
          {t("location.promptBody")}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onNotNow} disabled={loading}>
            {t("location.notNow")}
          </Button>
          <Button variant="primary" loading={loading} onClick={onAllow}>
            {t("location.allow")}
          </Button>
        </div>
      </div>
    </div>
  );
}
