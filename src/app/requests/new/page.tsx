"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { isDemoMode } from "@/lib/config";
import { mockCategories } from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/client";
import { requestSchema } from "@/lib/validations";
import type { Category } from "@/types";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function NewRequestPage() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    title: "",
    description: "",
    category_id: "",
    budget_min: "",
    budget_max: "",
    location: "",
    deadline: "",
  });

  useEffect(() => {
    if (isDemoMode()) {
      setCategories(mockCategories);
      return;
    }

    const supabase = createClient();
    supabase
      .from("categories")
      .select("*")
      .order("sort_order")
      .then(({ data }) => setCategories(data ?? []));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parsed = requestSchema.safeParse({
      ...form,
      budget_min: form.budget_min ? Number(form.budget_min) : undefined,
      budget_max: form.budget_max ? Number(form.budget_max) : undefined,
      category_id: form.category_id || undefined,
      deadline: form.deadline || undefined,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);

    if (isDemoMode()) {
      setLoading(false);
      router.push("/requests/req-1");
      return;
    }

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login?redirect=/requests/new");
      return;
    }

    const { data, error } = await supabase
      .from("requests")
      .insert({
        customer_id: user.id,
        title: parsed.data.title,
        description: parsed.data.description,
        category_id: parsed.data.category_id,
        budget_min: parsed.data.budget_min,
        budget_max: parsed.data.budget_max,
        location: parsed.data.location,
        deadline: parsed.data.deadline,
      })
      .select()
      .single();

    setLoading(false);

    if (error) {
      setErrors({ form: "Не удалось создать запрос. Попробуйте снова." });
      return;
    }

    router.push(`/requests/${data.id}`);
  };

  return (
    <AppLayout activePath="/requests/new">
      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <h1 className="text-xl font-bold">Новый запрос</h1>

        <Input
          id="title"
          label="Заголовок"
          placeholder="Например: Нужен ремонт кухни"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          error={errors.title}
        />

        <Textarea
          id="description"
          label="Описание"
          placeholder="Опишите задачу подробно..."
          rows={5}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          error={errors.description}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Категория
          </label>
          <select
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Выберите категорию</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            id="budget_min"
            label="Бюджет от"
            type="number"
            placeholder="0"
            value={form.budget_min}
            onChange={(e) => setForm({ ...form, budget_min: e.target.value })}
          />
          <Input
            id="budget_max"
            label="Бюджет до"
            type="number"
            placeholder="0"
            value={form.budget_max}
            onChange={(e) => setForm({ ...form, budget_max: e.target.value })}
          />
        </div>

        <Input
          id="location"
          label="Локация"
          placeholder="Город или удалённо"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
        />

        <Input
          id="deadline"
          label="Срок (необязательно)"
          type="date"
          value={form.deadline}
          onChange={(e) => setForm({ ...form, deadline: e.target.value })}
        />

        {errors.form && <p className="text-sm text-red-600">{errors.form}</p>}

        <Button type="submit" loading={loading} className="w-full">
          Опубликовать запрос
        </Button>
      </form>
    </AppLayout>
  );
}
