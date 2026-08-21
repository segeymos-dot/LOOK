"use client";

import { LoginEmailField } from "@/components/auth/LoginEmailField";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { isDemoMode } from "@/lib/config";
import { safeRedirectPath } from "@/lib/app-url";
import { LOOK_OFFICIAL_WEBSITE_URL } from "@/lib/brand/official-site";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type LoginFormProps = {
  /** Email from look_last_login_email cookie (SSR) — helps Safari associate username. */
  initialEmail?: string;
};

/**
 * Password login: real HTML form POST to /login/submit → 303 /login/done (200 HTML).
 * That navigation chain restores Safari/iOS "Save Password".
 */
export function LoginForm({ initialEmail = "" }: LoginFormProps) {
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  const demo = isDemoMode();

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const code = searchParams.get("error");
    if (!code) return;
    setErrors({
      form:
        code === "too_many_attempts"
          ? t("auth.errors.rateLimit")
          : t("auth.login.invalidCredentials"),
    });
  }, [searchParams, t]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    if (demo) {
      e.preventDefault();
      window.location.assign(redirect);
    }
  };

  return (
    <AuthLayout
      title={t("auth.login.title")}
      subtitle={t("auth.login.subtitle")}
      banner={
        demo ? (
          <p className="mt-3 rounded-xl bg-warning-bg px-3 py-2 text-sm text-amber-800">
            {t("auth.login.demoBanner")}
          </p>
        ) : undefined
      }
      footer={
        <div className="space-y-2 text-center text-sm text-text-secondary">
          <p>
            {t("auth.login.noAccount")}{" "}
            <Link href="/register" className="font-semibold text-brand-600">
              {t("auth.login.register")}
            </Link>
          </p>
          <p className="text-xs">
            <Link href="/terms" className="text-brand-600">
              {t("legal.termsLink")}
            </Link>
            {" · "}
            <Link href="/privacy" className="text-brand-600">
              {t("legal.privacyLink")}
            </Link>
            {" · "}
            <a
              href={LOOK_OFFICIAL_WEBSITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600"
            >
              {t("brand.officialSite")}
            </a>
          </p>
        </div>
      }
    >
      <form
        method="post"
        action="/login/submit"
        onSubmit={handleSubmit}
        className="space-y-4"
        autoComplete="on"
      >
        <input type="hidden" name="redirect" value={redirect} />
        <LoginEmailField
          id="username"
          label={t("auth.login.email")}
          placeholder="you@example.com"
          error={errors.email}
          initialEmail={initialEmail}
        />
        <PasswordInput
          id="current-password"
          name="password"
          autoComplete="current-password"
          label={t("auth.login.password")}
          placeholder=""
          error={errors.password}
          required
          revealInLabel
        />

        <p className="text-xs leading-snug text-text-muted">
          {t("auth.login.passwordAutofillHint")}
        </p>

        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
        {"emailConfirm" in errors && errors.emailConfirm && (
          <Link
            href={`/check-email?email=${encodeURIComponent(errors.emailConfirm as string)}`}
            className="block text-center text-sm font-semibold text-brand-600"
          >
            {t("auth.login.checkEmail")}
          </Link>
        )}

        <div className="flex items-center justify-end">
          <Link href="/forgot-password" className="text-sm font-semibold text-brand-600">
            {t("auth.login.forgot")}
          </Link>
        </div>

        <button
          type="submit"
          className="gradient-brand inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold text-white shadow-sm transition-all hover:opacity-95 active:scale-[0.98] active:opacity-90"
        >
          {t("auth.login.submit")}
        </button>
      </form>
    </AuthLayout>
  );
}
