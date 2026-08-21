"use client";

import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState } from "react";
import { useTranslation } from "@/components/providers/LocaleProvider";

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      className,
      label,
      error,
      hint,
      id,
      autoComplete,
      defaultValue,
      value,
      ...props
    },
    ref
  ) => {
    const [visible, setVisible] = useState(false);
    const { t } = useTranslation();
    const isControlled = value !== undefined;

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-text-primary">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={id}
            className={cn(
              "w-full rounded-xl border border-border bg-surface px-4 py-3 pr-12",
              "min-h-[48px] text-base text-text-primary placeholder:text-text-muted",
              "transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20",
              error && "border-danger focus:border-danger focus:ring-danger/20",
              className
            )}
            {...props}
            type={visible ? "text" : "password"}
            autoComplete={autoComplete ?? "current-password"}
            {...(isControlled ? { value } : defaultValue !== undefined ? { defaultValue } : {})}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={visible ? t("common.hidePassword") : t("common.showPassword")}
            aria-pressed={visible}
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted hover:bg-surface-muted hover:text-text-secondary sm:h-11 sm:w-11"
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";
