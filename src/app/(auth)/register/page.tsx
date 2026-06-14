"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { mapAuthError } from "@/lib/test-auth";
import { registerSchema } from "@/lib/validations";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const demo = isDemoMode();

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "both" as "customer" | "provider" | "both",
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parsed = registerSchema.safeParse(form);
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
      router.push("/");
      return;
    }

    const supabase = createClient();

    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          full_name: parsed.data.full_name,
          role: parsed.data.role,
        },
      },
    });

    if (error) {
      setLoading(false);
      setErrors({ form: mapAuthError(error.message) });
      return;
    }

    if (!data.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });

      if (signInError) {
        setLoading(false);
        setErrors({
          form: "Аккаунт создан. Войдите вручную или используйте тестовый вход на странице логина.",
        });
        return;
      }
    }

    setLoading(false);
    router.push("/");
    router.refresh();
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
      <div className="mb-8 text-center">
        <Link href="/" className="text-3xl font-bold text-indigo-600">
          LOOK
        </Link>
        <p className="mt-2 text-gray-500">Создайте аккаунт</p>
        {demo && (
          <p className="mt-2 text-sm text-amber-600">
            Демо-режим: регистрация отключена
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="full_name"
          label="Имя"
          placeholder="Иван Иванов"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          error={errors.full_name}
        />
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
          placeholder="Минимум 6 символов"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium">Я хочу</label>
          <select
            value={form.role}
            onChange={(e) =>
              setForm({ ...form, role: e.target.value as typeof form.role })
            }
            className="w-full rounded-xl border border-gray-200 px-4 py-3"
          >
            <option value="customer">Нанимать исполнителей</option>
            <option value="provider">Предлагать услуги</option>
            <option value="both">И то, и другое</option>
          </select>
        </div>

        {errors.form && <p className="text-sm text-red-600">{errors.form}</p>}

        <Button type="submit" loading={loading} className="w-full">
          Зарегистрироваться
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="text-indigo-600">
          Войти
        </Link>
      </p>
    </div>
  );
}
