"use client";

import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { syncClientSession } from "@/lib/auth/sync-client-session";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { safeRedirectPath } from "@/lib/app-url";
import { createLoginSchema, mapAuthErrorT } from "@/lib/i18n/client-messages";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { syncSession } = useAuth();
  const { t } = useTranslation();
  const loginSchema = useMemo(() => createLoginSchema(t), [t]);
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  const demo = isDemoMode();

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ email: "", password: "" });

  const signIn = async (email: string, password: string) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email && user.email !== email) {
      await supabase.auth.signOut();
    }
    return supabase.auth.signInWithPassword({ email, password });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parsed = loginSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);

    if (demo) {
      setLoading(false);
      router.push(redirect);
      return;
    }

    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const result = await response.json();
    setLoading(false);

    if (!response.ok || !result.success) {
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
        setErrors({ form: mapAuthErrorT(error.message, t) });
        return;
      }
    } else {
      await syncSession();
    }

    router.push(redirect);
    router.refresh();
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
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="email"
          label={t("auth.login.email")}
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={errors.email}
        />
        <PasswordInput
          id="password"
          label={t("auth.login.password")}
          placeholder="••••••"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
        />

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
