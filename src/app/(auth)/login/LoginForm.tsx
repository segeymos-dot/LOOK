"use client";

import { LoginEmailField } from "@/components/auth/LoginEmailField";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import {
  isPasskeySupported,
  passkeyErrorCode,
  signInWithUserPasskey,
} from "@/lib/auth/passkeys";
import { syncClientSession } from "@/lib/auth/sync-client-session";
import { isDemoMode } from "@/lib/config";
import { safeRedirectPath } from "@/lib/app-url";
import { mapAuthErrorT } from "@/lib/i18n/client-messages";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type LoginFormProps = {
  /** Email from look_last_login_email cookie (SSR) — helps Safari associate username. */
  initialEmail?: string;
};

/**
 * Password login: real HTML form POST to /login/submit → 303 /login/done (200 HTML).
 * That navigation chain is what restores Safari/iOS "Save Password".
 *
 * Do not use fetch/preventDefault for the password path. Do not put loading UI
 * on the submit button during native submit. Passkey stays outside this form.
 */
export function LoginForm({ initialEmail = "" }: LoginFormProps) {
  const searchParams = useSearchParams();
  const { syncSession } = useAuth();
  const { t } = useTranslation();
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  const demo = isDemoMode();

  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [passkeyNotice, setPasskeyNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setPasskeyAvailable(isPasskeySupported());
  }, []);

  useEffect(() => {
    const code = searchParams.get("error");
    if (!code) return;
    const mapped =
      code === "invalid_credentials"
        ? t("auth.login.invalidCredentials")
        : code === "too_many_attempts"
          ? t("auth.errors.rateLimit")
          : t("auth.login.invalidCredentials");
    setErrors({ form: mapped });
  }, [searchParams, t]);

  const handlePasskeySignIn = async () => {
    if (demo) {
      window.location.assign(redirect);
      return;
    }
    setPasskeyNotice(null);
    setPasskeyLoading(true);
    try {
      const { data, error } = await signInWithUserPasskey();
      if (error || !data?.session?.access_token || !data.session.refresh_token) {
        const code = passkeyErrorCode(error);
        setPasskeyLoading(false);
        if (code === "cancelled") return;
        setPasskeyNotice(
          code === "unsupported"
            ? t("auth.login.passkeyUnsupported")
            : mapAuthErrorT(error?.message ?? t("auth.login.passkeyFailed"), t)
        );
        return;
      }

      const synced = await syncClientSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (!synced) {
        setPasskeyLoading(false);
        setPasskeyNotice(t("auth.login.passkeyFailed"));
        return;
      }

      await syncSession();
      await authFetch("/api/auth/sessions").catch(() => undefined);
      window.location.assign(redirect);
    } catch (err) {
      const code = passkeyErrorCode(err);
      setPasskeyLoading(false);
      if (code === "cancelled") return;
      setPasskeyNotice(
        code === "unsupported"
          ? t("auth.login.passkeyUnsupported")
          : t("auth.login.passkeyFailed")
      );
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    // Only intercept demo mode. Real login must be a native POST so Safari
    // can offer Save Password — never preventDefault / fetch / setState here.
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
          </p>
        </div>
      }
    >
      <div className="space-y-4">
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
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-brand-600"
            >
              {t("auth.login.forgot")}
            </Link>
          </div>

          {/* Native submit control — no loading swap that remounts during POST. */}
          <button
            type="submit"
            disabled={passkeyLoading}
            className="gradient-brand inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold text-white shadow-sm transition-all hover:opacity-95 active:scale-[0.98] active:opacity-90 disabled:pointer-events-none disabled:opacity-50"
          >
            {t("auth.login.submit")}
          </button>
        </form>

        {passkeyAvailable && (
          <div className="space-y-3">
            <div className="relative py-1 text-center">
              <span className="relative z-10 bg-surface px-3 text-xs uppercase tracking-wide text-text-muted">
                {t("auth.login.or")}
              </span>
              <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border-subtle" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              loading={passkeyLoading}
              onClick={() => void handlePasskeySignIn()}
            >
              {t("auth.login.passkey")}
            </Button>
            <p className="text-xs leading-snug text-text-muted">
              {t("auth.login.passkeyNotPasswordHint")}
            </p>
            {passkeyNotice && (
              <p className="text-sm text-danger">{passkeyNotice}</p>
            )}
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
