"use client";

import { LoginEmailField } from "@/components/auth/LoginEmailField";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import {
  offerPasswordManagerSave,
  readLoginCredentialsFromForm,
} from "@/lib/auth/password-manager";
import { rememberLoginEmail } from "@/lib/auth/recent-login-emails";
import { syncClientSession } from "@/lib/auth/sync-client-session";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { safeRedirectPath } from "@/lib/app-url";
import { createLoginSchema, mapAuthErrorT } from "@/lib/i18n/client-messages";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const { syncSession, clearPrivateAuthState } = useAuth();
  const { t } = useTranslation();
  const loginSchema = useMemo(() => createLoginSchema(t), [t]);
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  const demo = isDemoMode();
  const formRef = useRef<HTMLFormElement>(null);

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savePassword, setSavePassword] = useState(false);

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

  const signIn = async (email: string, password: string) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email && user.email !== email) {
      clearPrivateAuthState();
      const { clearPrivateClientStorage } = await import(
        "@/lib/auth/sign-out-cleanup"
      );
      const { resetBrowserClient } = await import("@/lib/supabase/client");
      clearPrivateClientStorage();
      await supabase.auth.signOut({ scope: "local" });
      resetBrowserClient();
    }
    return createClient().auth.signInWithPassword({ email, password });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
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

    rememberLoginEmail(parsed.data.email);

    // Safari/iOS: PasswordCredential is unsupported. A real form POST + redirect
    // is what triggers the system "Save Password" sheet. Do not preventDefault.
    if (savePassword && !demo) {
      setLoading(true);
      return;
    }

    e.preventDefault();
    setErrors({});
    setLoading(true);

    if (demo) {
      setLoading(false);
      window.location.assign(redirect);
      return;
    }

    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      setLoading(false);
      const rawError = result.error ?? t("auth.login.invalidCredentials");
      const mapped = mapAuthErrorT(rawError, t);
      const emailNotConfirmed =
        rawError.toLowerCase().includes("email not confirmed") ||
        mapped === t("auth.errors.emailNotConfirmed");
      setErrors({
        form: mapped,
        ...(emailNotConfirmed ? { emailConfirm: parsed.data.email } : {}),
      });
      return;
    }

    const synced = await syncClientSession(result.session);
    if (!synced) {
      const { error } = await signIn(parsed.data.email, parsed.data.password);
      if (error) {
        setLoading(false);
        setErrors({ form: mapAuthErrorT(error.message, t) });
        return;
      }
    } else {
      await syncSession();
    }

    // Chromium progressive enhancement only (no-op on Safari).
    try {
      await offerPasswordManagerSave(formRef.current, parsed.data);
    } catch {
      // ignore
    }

    window.location.assign(redirect);
  };

  const formAction = savePassword
    ? "/api/auth/sign-in-form"
    : "/login";

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
        action={formAction}
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
        />
        <PasswordInput
          id="current-password"
          name="password"
          autoComplete="current-password"
          label={t("auth.login.password")}
          placeholder="••••••"
          defaultValue=""
          error={errors.password}
        />

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-subtle bg-surface-muted/60 px-3 py-3">
          <input
            id="save-password"
            name="save-password"
            type="checkbox"
            checked={savePassword}
            onChange={(e) => setSavePassword(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-border text-brand-600 focus:ring-brand-500/30"
            autoComplete="off"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-text-primary">
              {t("auth.login.savePassword")}
            </span>
            <span className="mt-0.5 block text-xs leading-snug text-text-muted">
              {t("auth.login.savePasswordHint")}
            </span>
          </span>
        </label>

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

        <Button type="submit" loading={loading} className="w-full">
          {t("auth.login.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
