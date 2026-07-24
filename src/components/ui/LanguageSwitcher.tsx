"use client";

import { useTranslation } from "@/components/providers/LocaleProvider";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  className?: string;
  compact?: boolean;
}

export function LanguageSwitcher({ className, compact = false }: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useTranslation();

  const options: { value: Locale; label: string }[] = [
    { value: "ru", label: t("common.russian") },
    { value: "en", label: t("common.english") },
  ];

  return (
    <div
      className={cn(
        "inline-flex rounded-xl border border-border bg-white p-[3px]",
        className
      )}
      role="group"
      aria-label={t("common.language")}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setLocale(option.value)}
          className={cn(
            "inline-flex min-h-[36px] min-w-[44px] items-center justify-center rounded-lg px-3 text-sm font-semibold transition-colors sm:px-4",
            locale === option.value
              ? "bg-brand-600 text-white shadow-sm"
              : "bg-white text-[#111111] hover:bg-slate-50"
          )}
        >
          {compact ? option.value.toUpperCase() : option.label}
        </button>
      ))}
    </div>
  );
}
