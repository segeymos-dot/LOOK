"use client";

import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { cn } from "@/lib/utils";
import type { UiMode } from "@/lib/auth/ui-mode";

interface UiModeSwitchProps {
  className?: string;
}

/**
 * Visible only for role=both. Changes local UI mode only — never profiles.role.
 */
export function UiModeSwitch({ className }: UiModeSwitchProps) {
  const { canSwitchUiMode, effectiveUiMode, setUiMode } = useAuth();
  const { t } = useTranslation();

  if (!canSwitchUiMode) return null;

  const options: { value: UiMode; label: string }[] = [
    { value: "customer", label: t("uiMode.customer") },
    { value: "provider", label: t("uiMode.provider") },
  ];

  return (
    <div
      className={cn(
        "flex rounded-xl border border-border-subtle bg-surface p-1",
        className
      )}
      role="group"
      aria-label={t("uiMode.label")}
    >
      {options.map(({ value, label }) => {
        const active = effectiveUiMode === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setUiMode(value)}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              active
                ? "bg-brand-600 text-white"
                : "text-text-secondary hover:text-text-primary"
            )}
            aria-pressed={active}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
