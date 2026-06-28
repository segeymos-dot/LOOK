"use client";

import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { getAuthEmailRedirectTo } from "@/lib/app-url";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { createForgotPasswordSchema, mapAuthErrorT } from "@/lib/i18n/client-messages";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const forgotPasswordSchema = useMemo(() => createForgotPasswordSchema(t), [t]);
  const demo = isDemoMode();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors({ email: parsed.error.errors[0]?.message ?? t("validation.emailInvalid") });
      return;
    }

    if (demo) {
      setSent(true);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: getAuthEmailRedirectTo("reset"),
    });
    setLoading(false);

    if (error) {
      setErrors({ form: mapAuthErrorT(error.message, t) });
      return;
    }

    setSent(true);
  };

  return (
    <AuthLayout
      title={t("auth.forgot.title")}
      subtitle={sent ? t("auth.forgot.subtitleSent") : t("auth.forgot.subtitle")}
      footer={
        <p className="text-center text-sm text-text-secondary">
          <Link href="/login" className="font-semibold text-brand-600">
            {t("auth.forgot.back")}
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-text-secondary">
            {t("auth.forgot.sent", { email })}
          </p>
          <Link href="/login">
            <Button className="w-full">{t("auth.forgot.toLogin")}</Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="email"
            label={t("auth.forgot.email")}
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
          {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
          <Button type="submit" loading={loading} className="w-full">
            {t("auth.forgot.submit")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
