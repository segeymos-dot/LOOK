"use client";

import { CategoryMultiSelect } from "@/components/profile/CategoryMultiSelect";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import { isDemoMode } from "@/lib/config";
import { mockCategories } from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function ProviderOnboardingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    user,
    ready,
    displayProfile,
    isCustomer,
    isProvider,
    setProfile,
    refreshProfile,
    setUiMode,
  } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    city: "",
    country: "",
    bio: "",
    provider_category_slugs: [] as string[],
  });

  useEffect(() => {
    if (!displayProfile) return;
    setForm((current) => ({
      ...current,
      full_name: displayProfile.full_name ?? current.full_name,
      city: displayProfile.city ?? current.city,
      country: displayProfile.country ?? current.country,
      bio: displayProfile.bio ?? current.bio,
      provider_category_slugs:
        displayProfile.provider_category_slugs?.length
          ? displayProfile.provider_category_slugs
          : current.provider_category_slugs,
    }));
  }, [displayProfile]);

  useEffect(() => {
    if (isDemoMode()) {
      setCategories(mockCategories);
      return;
    }
    const supabase = createClient();
    void supabase
      .from("categories")
      .select("*")
      .order("sort_order")
      .then(({ data }) => setCategories(data ?? []));
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login?redirect=/onboarding/provider");
      return;
    }
    if (isProvider) {
      router.replace("/profile");
    }
  }, [ready, user, isProvider, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.full_name.trim().length < 2) {
      setError(t("validation.minName"));
      return;
    }
    if (!form.city.trim()) {
      setError(t("onboarding.provider.cityRequired"));
      return;
    }
    if (form.bio.trim().length < 10) {
      setError(t("onboarding.provider.bioRequired"));
      return;
    }
    if (form.provider_category_slugs.length < 1) {
      setError(t("onboarding.provider.categoriesRequired"));
      return;
    }
    if (!confirm) {
      setError(t("onboarding.provider.confirmRequired"));
      return;
    }

    setLoading(true);
    try {
      if (isDemoMode()) {
        setUiMode("provider");
        router.push("/profile");
        return;
      }

      const res = await authFetch("/api/onboarding/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          city: form.city.trim(),
          country: form.country.trim() || null,
          bio: form.bio.trim(),
          provider_category_slugs: form.provider_category_slugs,
          confirm: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("onboarding.provider.error"));
        return;
      }
      if (data.profile) setProfile(data.profile);
      await refreshProfile();
      setUiMode("provider");
      router.push("/profile");
      router.refresh();
    } catch {
      setError(t("onboarding.provider.error"));
    } finally {
      setLoading(false);
    }
  };

  if (!ready || !user || !isCustomer || isProvider) {
    return (
      <AppLayout activePath="/profile" title={t("onboarding.provider.title")}>
        <div className="p-4 text-sm text-text-secondary">{t("common.loading")}</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout activePath="/profile" title={t("onboarding.provider.title")}>
      <div className="space-y-4 p-4">
        <Card padding="md" className="space-y-2">
          <h1 className="text-lg font-bold text-text-primary">
            {t("onboarding.provider.title")}
          </h1>
          <p className="text-sm text-text-secondary">
            {t("onboarding.provider.subtitle")}
          </p>
        </Card>

        <Card padding="md">
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <Input
              id="onboarding-full-name"
              label={t("onboarding.provider.displayName")}
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                id="onboarding-city"
                label={t("onboarding.provider.city")}
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
              <Input
                id="onboarding-country"
                label={t("onboarding.provider.region")}
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </div>
            <Textarea
              id="onboarding-bio"
              label={t("onboarding.provider.about")}
              rows={4}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder={t("onboarding.provider.aboutPlaceholder")}
            />
            <CategoryMultiSelect
              categories={categories}
              selected={form.provider_category_slugs}
              onChange={(slugs) =>
                setForm({ ...form, provider_category_slugs: slugs })
              }
              label={t("onboarding.provider.categories")}
            />
            <label className="flex items-start gap-3 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500"
              />
              <span>{t("onboarding.provider.confirm")}</span>
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Link href="/profile" className="flex-1">
                <Button type="button" variant="secondary" className="w-full">
                  {t("common.cancel")}
                </Button>
              </Link>
              <Button type="submit" loading={loading} className="flex-1">
                {t("onboarding.provider.submit")}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AppLayout>
  );
}
