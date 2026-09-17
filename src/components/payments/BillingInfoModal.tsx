"use client";

import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useEffect } from "react";

type BillingInfoModalProps = {
  open: boolean;
  title: string;
  body: string;
  footnote?: string;
  confirmLabel?: string;
  onClose: () => void;
};

/** Single-action informational modal (no forms / no card or bank fields). */
export function BillingInfoModal({
  open,
  title,
  body,
  footnote,
  confirmLabel,
  onClose,
}: BillingInfoModalProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="billing-info-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="billing-info-title"
          className="text-lg font-semibold text-text-primary"
        >
          {title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary whitespace-pre-wrap">
          {body}
        </p>
        {footnote ? (
          <p className="mt-3 rounded-xl bg-surface-muted px-3 py-2 text-xs leading-relaxed text-text-muted">
            {footnote}
          </p>
        ) : null}
        <div className="mt-5">
          <Button
            type="button"
            className="w-full"
            size="lg"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
          >
            {confirmLabel ?? t("common.gotIt")}
          </Button>
        </div>
      </div>
    </div>
  );
}
