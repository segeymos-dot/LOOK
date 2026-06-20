"use client";

import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { mapAuthError } from "@/lib/test-auth";
import { resetPasswordSchema } from "@/lib/validations";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const router = useRouter();
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
      setErrors({ form: mapAuthError(error.message) });
      return;
    }

    router.push("/login");
    router.refresh();
  };

  if (!ready) return null;

  return (
    <AuthLayout
      title="Новый пароль"
      subtitle="Введите новый пароль для вашего аккаунта"
      footer={
        <p className="text-center text-sm text-text-secondary">
          <Link href="/login" className="font-semibold text-brand-600">
            Ко входу
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="password"
          label="Новый пароль"
          type="password"
          placeholder="Минимум 6 символов"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
        />
        <Input
          id="confirmPassword"
          label="Повторите пароль"
          type="password"
          placeholder="••••••"
          value={form.confirmPassword}
          onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
          error={errors.confirmPassword}
        />
        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
        <Button type="submit" loading={loading} className="w-full">
          Сохранить пароль
        </Button>
      </form>
    </AuthLayout>
  );
}
