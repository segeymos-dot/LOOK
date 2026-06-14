"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/hooks/useAuth";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function ProfilePage() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    bio: "",
    city: "",
    country: "",
    role: "both" as "customer" | "provider" | "both",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name,
        bio: profile.bio ?? "",
        city: profile.city ?? "",
        country: profile.country ?? "",
        role: profile.role,
      });
    }
  }, [profile]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);

    if (!isDemoMode()) {
      const supabase = createClient();
      await supabase.from("profiles").update(form).eq("id", user.id);
    }

    setSaving(false);
    setEditing(false);
  };

  if (authLoading) {
    return (
      <AppLayout activePath="/profile">
        <div className="flex items-center justify-center py-20">
          <p className="text-gray-400">Загрузка...</p>
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout activePath="/profile">
        <div className="flex flex-col items-center justify-center px-4 py-20">
          <p className="mb-4 text-gray-500">Войдите в аккаунт</p>
          <Link href="/login">
            <Button>Войти</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout activePath="/profile">
      <div className="space-y-6 p-4">
        <div className="flex flex-col items-center text-center">
          <Avatar
            src={profile?.avatar_url}
            name={profile?.full_name ?? "User"}
            size="lg"
          />
          <h1 className="mt-3 text-xl font-bold">{profile?.full_name}</h1>
          {profile?.rating ? (
            <p className="text-sm text-gray-500">
              ★ {profile.rating.toFixed(1)} · {profile.reviews_count} отзывов
            </p>
          ) : null}
        </div>

        {editing ? (
          <form onSubmit={handleSave} className="space-y-4">
            <Input
              id="full_name"
              label="Имя"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
            <Textarea
              id="bio"
              label="О себе"
              rows={3}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
            <Input
              id="city"
              label="Город"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
            <Input
              id="country"
              label="Страна"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium">Роль</label>
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as typeof form.role })
                }
                className="w-full rounded-xl border border-gray-200 px-4 py-3"
              >
                <option value="customer">Заказчик</option>
                <option value="provider">Исполнитель</option>
                <option value="both">Оба</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" loading={saving} className="flex-1">
                Сохранить
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditing(false)}
              >
                Отмена
              </Button>
            </div>
          </form>
        ) : (
          <>
            {profile?.bio && (
              <p className="text-center text-gray-600">{profile.bio}</p>
            )}
            {(profile?.city || profile?.country) && (
              <p className="text-center text-sm text-gray-500">
                {[profile.city, profile.country].filter(Boolean).join(", ")}
              </p>
            )}

            <div className="space-y-2">
              <Link href="/my/requests">
                <Button variant="secondary" className="w-full">
                  Мои запросы
                </Button>
              </Link>
              <Link href="/my/offers">
                <Button variant="secondary" className="w-full">
                  Мои предложения
                </Button>
              </Link>
              <Button variant="secondary" className="w-full" onClick={() => setEditing(true)}>
                Редактировать профиль
              </Button>
              <Button
                variant="ghost"
                className="w-full text-red-600"
                onClick={async () => {
                  await signOut();
                  router.push("/");
                }}
              >
                Выйти
              </Button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
