"use client";

import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

type SearchAuthPromptProps = {
  open: boolean;
  onClose: () => void;
};

export function SearchAuthPrompt({ open, onClose }: SearchAuthPromptProps) {
  const { t } = useTranslation();
  const router = useRouter();

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-auth-prompt-title"
      onClick={onClose}
      data-testid="search-auth-prompt"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="search-auth-prompt-title"
          className="text-lg font-semibold text-text-primary"
        >
          {t("search.authPromptTitle")}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {t("search.authPromptDesc")}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={() => router.push("/login?redirect=/search")}
            data-testid="search-auth-login"
          >
            {t("search.authPromptLogin")}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/register?redirect=/search")}
            data-testid="search-auth-register"
          >
            {t("search.authPromptRegister")}
          </Button>
          <Button variant="outline" onClick={onClose} data-testid="search-auth-cancel">
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
