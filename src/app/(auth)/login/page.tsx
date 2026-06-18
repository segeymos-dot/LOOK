"use client";

import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import {
  getTestAccounts,
  isTestLoginEnabled,
  mapAuthError,
  type TestAccount,
} from "@/lib/test-auth";
import { safeRedirectPath } from "@/lib/app-url";
import { loginSchema } from "@/lib/validations";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  const demo = isDemoMode();
  const testLoginEnabled = isTestLoginEnabled() && !demo;
  const testAccounts = getTestAccounts();

  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ email: "", password: "" });

  useEffect(() => {
    if (!testLoginEnabled) return;
    fetch("/api/dev/ensure-test-users", { method: "POST" }).catch(() => {});
  }, [testLoginEnabled]);

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

    const { error } = await signIn(parsed.data.email, parsed.data.password);
    setLoading(false);

    if (error) {
      setErrors({ form: "Неверный email или пароль" });
      return;
    }

    router.push(redirect);
    router.refresh();
  };

  const handleTestLogin = async (account: TestAccount) => {
    setErrors({});
    setTestLoading(account.id);

    await fetch("/api/dev/ensure-test-users", { method: "POST" }).catch(() => {});

    const { error } = await signIn(account.email, account.password);
    setTestLoading(null);

    if (error) {
      const seedRes = await fetch("/api/dev/ensure-test-users", {
        method: "POST",
      }).catch(() => null);
      const seedData = seedRes ? await seedRes.json().catch(() => null) : null;

      setErrors({
        form:
          seedData?.error === "SUPABASE_SERVICE_ROLE_KEY is not configured"
            ? `Тестовый аккаунт ${account.email} не найден. Добавьте SUPABASE_SERVICE_ROLE_KEY в .env.local или выполните supabase/migrations/005_seed_test_users.sql в SQL Editor.`
            : `Не удалось войти как ${account.label}. ${mapAuthError(error.message)}`,
      });
      return;
    }

    router.push(redirect);
    router.refresh();
  };

  return (
    <AuthLayout
      title="Вход"
      subtitle="Добро пожаловать обратно"
      banner={
        demo ? (
          <p className="mt-3 rounded-xl bg-warning-bg px-3 py-2 text-sm text-amber-800">
            Демо-режим: авторизация отключена
          </p>
        ) : undefined
      }
      footer={
        <p className="text-center text-sm text-text-secondary">
          Нет аккаунта?{" "}
          <Link href="/register" className="font-semibold text-brand-600">
            Зарегистрироваться
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={errors.email}
        />
        <Input
          id="password"
          label="Пароль"
          type="password"
          placeholder="••••••"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
        />

        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

        <Button type="submit" loading={loading} className="w-full">
          Войти
        </Button>
      </form>

      {testLoginEnabled && (
        <Card variant="outline" padding="sm" className="mt-6 bg-brand-50/30">
          <p className="text-sm font-semibold text-text-primary">Быстрый тестовый вход</p>
          <p className="mt-1 text-xs text-text-secondary">Пароль: Test1234!</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {testAccounts.map((account) => (
              <Button
                key={account.id}
                type="button"
                variant="secondary"
                size="sm"
                loading={testLoading === account.id}
                onClick={() => handleTestLogin(account)}
              >
                {account.label}
              </Button>
            ))}
          </div>
        </Card>
      )}
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
