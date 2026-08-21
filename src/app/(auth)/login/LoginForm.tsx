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
import { readLoginCredentialsFromForm } from "@/lib/auth/password-manager";
import { syncClientSession } from "@/lib/auth/sync-client-session";
import { isDemoMode } from "@/lib/config";
import { safeRedirectPath } from "@/lib/app-url";
import { createLoginSchema, mapAuthErrorT } from "@/lib/i18n/client-messages";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type LoginFormProps = {
  /** Email from look_last_login_email cookie (SSR) — helps Safari associate username. */
  initialEmail?: string;
};

/**
 * Password login always uses a real HTML form POST + 303 redirect.
 * Safari/iOS Password AutoFill / Save Password depends on that navigation —
 * fetch()+preventDefault and mid-submit React setState break it.
 */
export function LoginForm({ initialEmail = "" }: LoginFormProps) {
  const searchParams = useSearchParams();
  const { syncSession } = useAuth();
  const { t } = useTranslation();
  const loginSchema = useMemo(() => createLoginSchema(t), [t]);
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  const demo = isDemoMode();
  const formRef = useRef<HTMLFormElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
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

  // After username is present, move focus to password so iOS shows AutoFill /
  // Passwords (tap / Face ID still required — Safari does not silent-fill).
  useEffect(() => {
    if (!initialEmail.trim()) return;
    const id = window.setTimeout(() => {
      passwordRef.current?.focus({ preventScroll: true });
    }, 50);
    return () => window.clearTimeout(id);
  }, [initialEmail]);

  const handlePasskeySignIn = async () => {
    if (demo) {
      window.location.assign(redirect);
      return;
    }
    setErrors({});
    setPasskeyLoading(true);
    try {
      const { data, error } = await signInWithUserPasskey();
      if (error || !data?.session?.access_token || !data.session.refresh_token) {
        const code = passkeyErrorCode(error);
        setErrors({
          form:
            code === "unsupported"
              ? t("auth.login.passkeyUnsupported")
              : code === "cancelled"
                ? t("auth.login.passkeyCancelled")
                : mapAuthErrorT(
                    error?.message ?? t("auth.login.passkeyFailed"),
                    t
                  ),
        });
        setPasskeyLoading(false);
        return;
      }

      const synced = await syncClientSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (!synced) {
        setPasskeyLoading(false);
        setErrors({ form: t("auth.login.passkeyFailed") });
        return;
      }

      await syncSession();
      await authFetch("/api/auth/sessions").catch(() => undefined);
      window.location.assign(redirect);
    } catch (err) {
      const code = passkeyErrorCode(err);
      setPasskeyLoading(false);
      setErrors({
        form:
          code === "unsupported"
            ? t("auth.login.passkeyUnsupported")
            : code === "cancelled"
              ? t("auth.login.passkeyCancelled")
              : t("auth.login.passkeyFailed"),
      });
    }
  };

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
    // Session cookies are written by /api/auth/sign-in-form (overwrites prior session).
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
          ref={passwordRef}
          id="current-password"
          name="password"
          autoComplete="current-password"
          label={t("auth.login.password")}
          placeholder="••••••"
          error={errors.password}
          required
          revealInLabel
          // Helps iOS show AutoFill on focus without fighting hydration.
          readOnly
        />

        <p className="rounded-xl border border-border-subtle bg-surface-muted/60 px-3 py-3 text-xs leading-snug text-text-muted">
          <span className="block text-sm font-medium text-text-primary">
            {t("auth.login.devicePasswordManager")}
          </span>
          <span className="mt-0.5 block">
            {t("auth.login.devicePasswordManagerHint")}
          </span>
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

        <Button type="submit" disabled={passkeyLoading} className="w-full">
          {t("auth.login.submit")}
        </Button>

        {passkeyAvailable && (
          <>
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
          </>
        )}
      </form>
    </AuthLayout>
  );
}
