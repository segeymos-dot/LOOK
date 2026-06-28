"use client";

import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { createResetPasswordSchema, mapAuthErrorT } from "@/lib/i18n/client-messages";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const resetPasswordSchema = useMemo(() => createResetPasswordSchema(t), [t]);
  const demo = isDemoMode();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ password: "", confirmPassword: "" });

  useEffect(() => {
    if (demo) {
      setReady(true);
      return;
    }

    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login?redirect=/reset-password");
        return;
      }
      setReady(true);
    });
  }, [demo, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parsed = resetPasswordSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    if (demo) {
      router.push("/login");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setLoading(false);

    if (error) {
      setErrors({ form: mapAuthErrorT(error.message, t) });
      return;
    }

    router.push("/login");
    router.refresh();
  };

  if (!ready) return null;

  return (
    <AuthLayout
      title={t("auth.reset.title")}
      subtitle={t("auth.reset.subtitle")}
      footer={
        <p className="text-center text-sm text-text-secondary">
          <Link href="/login" className="font-semibold text-brand-600">
            {t("auth.reset.toLogin")}
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordInput
          id="password"
          label={t("auth.reset.password")}
          autoComplete="new-password"
          placeholder="••••••"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
        />
        <PasswordInput
          id="confirmPassword"
          label={t("auth.reset.confirm")}
          autoComplete="new-password"
          placeholder="••••••"
          value={form.confirmPassword}
          onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
          error={errors.confirmPassword}
        />
        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
        <Button type="submit" loading={loading} className="w-full">
          {t("auth.reset.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
