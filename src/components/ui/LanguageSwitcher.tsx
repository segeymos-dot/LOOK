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
        "inline-flex rounded-xl border border-border-subtle bg-surface p-0.5",
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
            "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm",
            locale === option.value
              ? "bg-brand-600 text-white shadow-sm"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          {compact ? option.value.toUpperCase() : option.label}
        </button>
      ))}
    </div>
  );
}
