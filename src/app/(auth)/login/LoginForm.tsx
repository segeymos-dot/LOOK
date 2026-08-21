"use client";

import { LoginEmailField } from "@/components/auth/LoginEmailField";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { readLoginCredentialsFromForm } from "@/lib/auth/password-manager";
import { isDemoMode } from "@/lib/config";
import { safeRedirectPath } from "@/lib/app-url";
import { createLoginSchema } from "@/lib/i18n/client-messages";
import { LOOK_OFFICIAL_WEBSITE_URL } from "@/lib/brand/official-site";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type LoginFormProps = {
  /** Email from look_last_login_email cookie (SSR) — helps Safari associate username. */
  initialEmail?: string;
};

/**
 * Password login always uses a real HTML form POST + 303 redirect.
 * Safari/iOS Password AutoFill / Save Password depends on that navigation.
 */
export function LoginForm({ initialEmail = "" }: LoginFormProps) {
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const loginSchema = useMemo(() => createLoginSchema(t), [t]);
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  const demo = isDemoMode();
  const formRef = useRef<HTMLFormElement>(null);

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
    const formEl = e.currentTarget;
    const credentials = readLoginCredentialsFromForm(formEl, {
      email: "",
      password: "",
    });

    const parsed = loginSchema.safeParse(credentials);
    if (!parsed.success) {
      e.preventDefault();
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    if (demo) {
      e.preventDefault();
      window.location.assign(redirect);
      return;
    }

    // Do NOT preventDefault. Do NOT setState. Native POST → 303 redirect.
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
        ref={formRef}
        method="post"
        action="/api/auth/sign-in-form"
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

        <Button type="submit" className="w-full">
          {t("auth.login.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
