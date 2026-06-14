"use client";

import { Button } from "@/components/ui/Button";
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

    await fetch("/api/dev/ensure-test-users", { method: "POST" }).catch(
      () => {}
    );

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
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
      <div className="mb-8 text-center">
        <Link href="/" className="text-3xl font-bold text-indigo-600">
          LOOK
        </Link>
        <p className="mt-2 text-gray-500">Войдите в аккаунт</p>
        {demo && (
          <p className="mt-2 text-sm text-amber-600">
            Демо-режим: авторизация отключена
          </p>
        )}
      </div>

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

        {errors.form && <p className="text-sm text-red-600">{errors.form}</p>}

        <Button type="submit" loading={loading} className="w-full">
          Войти
        </Button>
      </form>

      {testLoginEnabled && (
        <div className="mt-6 space-y-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-4">
          <p className="text-sm font-medium text-indigo-900">
            Быстрый тестовый вход
          </p>
          <p className="text-xs text-indigo-700">
            Без отправки email. Пароль по умолчанию: Test1234!
          </p>
          <div className="grid grid-cols-2 gap-2">
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
        </div>
      )}

      <p className="mt-6 text-center text-sm text-gray-500">
        Нет аккаунта?{" "}
        <Link href="/register" className="text-indigo-600">
          Зарегистрироваться
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
