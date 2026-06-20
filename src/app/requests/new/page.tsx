"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/hooks/useAuth";
import { canActAsCustomer } from "@/lib/auth/roles";
import { isDemoMode } from "@/lib/config";
import { getMockCategoriesForProvider, getMockProfile, mockCategories } from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/client";
import { requestSchema } from "@/lib/validations";
import type { Category } from "@/types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";

export default function NewRequestPage() {
  return (
    <Suspense>
      <NewRequestPageContent />
    </Suspense>
  );
}

function NewRequestPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const providerId = searchParams.get("provider");
  const contactIntent = searchParams.get("intent") === "contact";
  const { displayProfile, loading: authLoading } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [providerName, setProviderName] = useState<string | null>(null);
  const [providerAvatar, setProviderAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    title: "",
    description: "",
    category_id: "",
    budget: "",
    location: "",
    deadline: "",
  });

  useEffect(() => {
    if (isDemoMode()) {
      setCategories(mockCategories);
      if (providerId) {
        const provider = getMockProfile(providerId);
        if (provider) {
          setProviderName(provider.full_name);
          setProviderAvatar(provider.avatar_url);
          const providerCategories = getMockCategoriesForProvider(provider.provider_category_slugs);
          if (providerCategories[0]) {
            setForm((prev) => ({ ...prev, category_id: providerCategories[0].id }));
          }
        }
      }
      return;
    }

    const supabase = createClient();
    supabase
      .from("categories")
      .select("*")
      .order("sort_order")
      .then(({ data }) => setCategories(data ?? []));

    if (!providerId) return;

    supabase
      .from("profiles")
      .select("full_name, avatar_url, provider_category_slugs")
      .eq("id", providerId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setProviderName(data.full_name);
        setProviderAvatar(data.avatar_url);
        supabase
          .from("categories")
          .select("*")
          .order("sort_order")
          .then(({ data: allCategories }) => {
            const slugs = Array.isArray(data.provider_category_slugs)
              ? data.provider_category_slugs
              : [];
            const match = allCategories?.find((cat) => slugs.includes(cat.slug));
            if (match) {
              setForm((prev) => ({ ...prev, category_id: match.id }));
            }
          });
      });
  }, [providerId]);

  const pageSubtitle = useMemo(() => {
    if (providerName) {
      return contactIntent
        ? `Создайте заказ для ${providerName} — чат откроется после принятия отклика`
        : `Заказ для исполнителя ${providerName}`;
    }
    return "Опишите задачу — исполнители отправят предложения";
  }, [contactIntent, providerName]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parsed = requestSchema.safeParse({
      ...form,
      budget: form.budget ? Number(form.budget) : undefined,
      deadline: form.deadline || undefined,
      location: form.location || undefined,
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
        budget_min: parsed.data.budget,
        budget_max: parsed.data.budget,
        currency: "USD",
        location: parsed.data.location,
        deadline: parsed.data.deadline,
      })
      .select()
      .single();

    setLoading(false);

    if (error) {
      setErrors({
        form:
          error.message.includes("row-level security")
            ? "Нет прав на создание заказа. Войдите как заказчик."
            : `Не удалось создать запрос: ${error.message}`,
      });
      return;
    }

    router.push(`/requests/${data.id}?created=1`);
  };

  if (!isDemoMode() && !authLoading && displayProfile && !canActAsCustomer(displayProfile.role)) {
    return (
      <AppLayout activePath="/requests/new" title="Новый запрос">
        <div className="space-y-4 p-4">
          <PageHeader title="Новый запрос" backHref="/" />
          <Card padding="md" className="border-amber-200 bg-warning-bg">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm text-amber-900">
                  Создавать заказы могут только заказчики. Измените роль в профиле на «Заказчик»
                  или «Оба».
                </p>
                <div className="mt-3 flex gap-2">
                  <Link href="/profile">
                    <Button size="sm">Профиль</Button>
                  </Link>
                  <Link href="/search">
                    <Button size="sm" variant="secondary">
                      Найти заказы
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout activePath="/requests/new" title="Новый запрос">
      <form onSubmit={handleSubmit} className="space-y-5 p-4">
        <PageHeader
          title="Создать заказ"
          subtitle={pageSubtitle}
          backHref={providerId ? `/providers/${providerId}` : "/"}
        />

        {providerName && (
          <Card padding="md" className="flex items-center gap-3 border-brand-100 bg-brand-50">
            <Avatar src={providerAvatar} name={providerName} size="md" ring />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                Исполнитель
              </p>
              <p className="font-semibold text-text-primary">{providerName}</p>
            </div>
          </Card>
        )}

        <Card padding="md" className="space-y-4">
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

          <Select
            id="category_id"
            label="Категория"
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            error={errors.category_id}
          >
            <option value="">Выберите категорию</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </Select>

          <Input
            id="budget"
            label="Бюджет (USD)"
            type="number"
            min={1}
            step={1}
            placeholder="1000"
            value={form.budget}
            onChange={(e) => setForm({ ...form, budget: e.target.value })}
            error={errors.budget}
          />

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
        </Card>

        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

        <Button type="submit" loading={loading} className="w-full" size="lg">
          Опубликовать заказ
        </Button>
      </form>
    </AppLayout>
  );
}
