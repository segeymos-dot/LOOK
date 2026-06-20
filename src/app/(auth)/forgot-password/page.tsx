"use client";

import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getClientAppOrigin } from "@/lib/app-url";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { mapAuthError } from "@/lib/test-auth";
import { forgotPasswordSchema } from "@/lib/validations";
import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
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
      setErrors({ email: parsed.error.errors[0]?.message ?? "Некорректный email" });
      return;
    }

    if (demo) {
      setSent(true);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const origin = getClientAppOrigin();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);

    if (error) {
      setErrors({ form: mapAuthError(error.message) });
      return;
    }

    setSent(true);
  };

  return (
    <AuthLayout
      title="Восстановление пароля"
      subtitle={sent ? "Письмо отправлено" : "Мы отправим ссылку для сброса пароля"}
      footer={
        <p className="text-center text-sm text-text-secondary">
          <Link href="/login" className="font-semibold text-brand-600">
            Вернуться ко входу
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-text-secondary">
            Если аккаунт с адресом <strong>{email}</strong> существует, вы получите письмо со
            ссылкой для создания нового пароля.
          </p>
          <Link href="/login">
            <Button className="w-full">Ко входу</Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="email"
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
          {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
          <Button type="submit" loading={loading} className="w-full">
            Отправить ссылку
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
