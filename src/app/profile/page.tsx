"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { CategoryMultiSelect } from "@/components/profile/CategoryMultiSelect";
import { AvatarUpload } from "@/components/profile/AvatarUpload";
import { PortfolioEditor } from "@/components/profile/PortfolioEditor";
import { PortfolioGallery } from "@/components/profile/PortfolioGallery";
import { ProviderStats } from "@/components/profile/ProviderStats";
import { ReviewsList } from "@/components/profile/ReviewsList";
import { VerificationBadges } from "@/components/profile/VerificationBadges";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/hooks/useAuth";
import { isDemoMode } from "@/lib/config";
import {
  canActAsCustomer,
  canActAsProvider,
  getRoleLabel,
} from "@/lib/auth/roles";
import { getMockReviewsForProvider, mockCategories } from "@/lib/mock/data";
import { getProviderVerification } from "@/lib/profile/provider-utils";
import { createClient } from "@/lib/supabase/client";
import type { Category, PortfolioItem, Review } from "@/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Building2,
  ClipboardList,
  ExternalLink,
  History,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Pencil,
  Search,
  Wallet,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

export default function ProfilePage() {
  const { user, profile, displayProfile, ready, signOut, setProfile, isPlatformAdmin } = useAuth();
  const router = useRouter();
  const resolvedProfile = displayProfile ?? profile;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [form, setForm] = useState({
    full_name: "",
    bio: "",
    city: "",
    country: "",
    phone: "",
    avatar_url: "",
    skills: "",
    portfolio_items: [] as PortfolioItem[],
    provider_category_slugs: [] as string[],
    role: "both" as "customer" | "provider" | "both",
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

  useEffect(() => {
    if (!resolvedProfile || !canActAsProvider(resolvedProfile.role)) return;

    if (isDemoMode()) {
      setReviews(getMockReviewsForProvider(resolvedProfile.id));
      return;
    }

    const supabase = createClient();
    supabase
      .from("reviews")
      .select("*, reviewer:profiles!reviews_reviewer_id_fkey(full_name, avatar_url)")
      .eq("provider_id", resolvedProfile.id)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setReviews((data ?? []) as Review[]));
  }, [resolvedProfile]);

  useEffect(() => {
    if (resolvedProfile) {
      setForm({
        full_name: resolvedProfile.full_name,
        bio: resolvedProfile.bio ?? "",
        city: resolvedProfile.city ?? "",
        country: resolvedProfile.country ?? "",
        phone: resolvedProfile.phone ?? "",
        avatar_url: resolvedProfile.avatar_url ?? "",
        skills: resolvedProfile.skills ?? "",
        portfolio_items: resolvedProfile.portfolio_items ?? [],
        provider_category_slugs: resolvedProfile.provider_category_slugs ?? [],
        role: resolvedProfile.role,
      });
    }
  }, [resolvedProfile]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);

    if (!isDemoMode()) {
      const supabase = createClient();
      const payload = {
        full_name: form.full_name,
        bio: form.bio || null,
        city: form.city || null,
        country: form.country || null,
        phone: form.phone || null,
        phone_verified: Boolean(form.phone?.trim()),
        avatar_url: form.avatar_url || null,
        skills: form.skills || null,
        portfolio_items: form.portfolio_items,
        provider_category_slugs: form.provider_category_slugs,
        role: form.role,
      };

      const { data, error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", user.id)
        .select("*")
        .single();

      if (error) {
        setSaving(false);
        return;
      }

      if (data) {
        setProfile(data);
        await supabase.auth.updateUser({
          data: { role: data.role, full_name: data.full_name },
        });
      }
    } else if (resolvedProfile) {
      setProfile({
        ...resolvedProfile,
        ...form,
        phone_verified: Boolean(form.phone?.trim()),
      });
    }

    setSaving(false);
    setEditing(false);
  };

  const showProviderSection =
    canActAsProvider(resolvedProfile?.role) ||
    form.role === "provider" ||
    form.role === "both";

  const verification = resolvedProfile
    ? getProviderVerification(resolvedProfile, Boolean(user?.email_confirmed_at))
    : null;

  if (ready && !user) {
    return (
      <AppLayout activePath="/profile" title="Профиль">
        <div className="flex flex-col items-center justify-center px-4 py-20">
          <Avatar name="?" size="xl" className="mb-4 opacity-50" />
          <p className="mb-4 text-text-secondary">Войдите в аккаунт</p>
          <Link href="/login?redirect=/profile">
            <Button>Войти</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout activePath="/profile" title="Профиль">
      <div className="space-y-5 p-4">
        <Card padding="lg" className="text-center">
          <Avatar
            src={resolvedProfile?.avatar_url}
            name={resolvedProfile?.full_name ?? user?.email ?? "User"}
            size="xl"
            ring
            className="mx-auto"
          />
          <h1 className="mt-4 text-xl font-bold tracking-tight">
            {resolvedProfile?.full_name ?? user?.email ?? "Профиль"}
          </h1>
          <Chip variant="brand" className="mt-2">
            {getRoleLabel(resolvedProfile?.role)}
          </Chip>

          {showProviderSection && resolvedProfile && (
            <div className="mt-4">
              <ProviderStats
                rating={Number(resolvedProfile.rating)}
                completedOrders={resolvedProfile.completed_orders_count}
                reviewsCount={resolvedProfile.reviews_count}
                variant="compact"
              />
            </div>
          )}

          {verification && showProviderSection && (
            <div className="mt-4">
              <VerificationBadges verification={verification} className="justify-center" />
            </div>
          )}

          {!editing && (
            <div className="mt-4 space-y-2 text-sm text-text-secondary">
              {user?.email && (
                <p className="flex items-center justify-center gap-2">
                  <Mail className="h-4 w-4" />
                  {user.email}
                </p>
              )}
              {resolvedProfile?.phone && (
                <p className="flex items-center justify-center gap-2">
                  <Phone className="h-4 w-4" />
                  {resolvedProfile.phone}
                </p>
              )}
              {(resolvedProfile?.city || resolvedProfile?.country) && (
                <p className="flex items-center justify-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {[resolvedProfile.city, resolvedProfile.country].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
          )}

          {showProviderSection && resolvedProfile && !editing && (
            <Link href={`/providers/${resolvedProfile.id}`} className="mt-4 inline-block">
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Публичный профиль
              </Button>
            </Link>
          )}
        </Card>

        {!editing && (
          <Card padding="md" className="space-y-3">
            <h2 className="text-sm font-semibold text-text-primary">Финансы (тест)</h2>
            <div className="grid gap-2">
              {showProviderSection && (
                <Link href="/my/balance">
                  <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                    <Wallet className="h-4 w-4" />
                    Баланс исполнителя
                  </Button>
                </Link>
              )}
              {(isPlatformAdmin || isDemoMode()) && (
                <Link href="/admin/platform">
                  <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                    <Building2 className="h-4 w-4" />
                    Баланс платформы LOOK
                  </Button>
                </Link>
              )}
              <Link href="/finance/transactions">
                <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                  <History className="h-4 w-4" />
                  История операций
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {editing ? (
          <Card padding="md">
            <form onSubmit={handleSave} className="space-y-4">
              {user && (
                <AvatarUpload
                  userId={user.id}
                  name={form.full_name || "User"}
                  value={form.avatar_url || null}
                  onChange={(url) => setForm({ ...form, avatar_url: url })}
                />
              )}
              <Input
                id="full_name"
                label="Имя"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
              <Input
                id="phone"
                label="Телефон"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
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
              </div>
              <Textarea
                id="bio"
                label="О себе"
                rows={3}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
              <Select
                id="role"
                label="Роль"
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as typeof form.role })
                }
              >
                <option value="customer">Заказчик</option>
                <option value="provider">Исполнитель</option>
                <option value="both">Оба</option>
              </Select>

              {(form.role === "provider" || form.role === "both") && user && (
                <>
                  <Input
                    id="skills"
                    label="Навыки"
                    placeholder="Через запятую"
                    value={form.skills}
                    onChange={(e) => setForm({ ...form, skills: e.target.value })}
                  />
                  <PortfolioEditor
                    userId={user.id}
                    items={form.portfolio_items}
                    onChange={(portfolio_items) => setForm({ ...form, portfolio_items })}
                  />
                  <CategoryMultiSelect
                    categories={categories}
                    selected={form.provider_category_slugs}
                    onChange={(slugs) =>
                      setForm({ ...form, provider_category_slugs: slugs })
                    }
                  />
                </>
              )}

              <div className="flex gap-2 pt-2">
                <Button type="submit" loading={saving} className="flex-1">
                  Сохранить
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                  Отмена
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <>
            {resolvedProfile?.bio && (
              <Card padding="md">
                <p className="text-sm leading-relaxed text-text-secondary">{resolvedProfile.bio}</p>
              </Card>
            )}

            {showProviderSection && resolvedProfile?.skills && (
              <Card padding="md">
                <h3 className="mb-2 text-sm font-semibold text-text-primary">Навыки</h3>
                <div className="flex flex-wrap gap-2">
                  {resolvedProfile.skills.split(",").map((skill) => (
                    <Chip key={skill.trim()}>{skill.trim()}</Chip>
                  ))}
                </div>
              </Card>
            )}

            {showProviderSection &&
              resolvedProfile &&
              (resolvedProfile.portfolio_items?.length ?? 0) > 0 && (
              <PortfolioGallery items={resolvedProfile.portfolio_items} />
            )}

            {showProviderSection && reviews.length > 0 && (
              <ReviewsList reviews={reviews} />
            )}

            <div className="space-y-2">
              {canActAsCustomer(resolvedProfile?.role) && (
                <Link href="/my/requests">
                  <Button variant="secondary" className="w-full gap-2">
                    <ClipboardList className="h-5 w-5" />
                    Мои запросы
                  </Button>
                </Link>
              )}
              {canActAsProvider(resolvedProfile?.role) && (
                <>
                  <Link href="/search">
                    <Button variant="secondary" className="w-full gap-2">
                      <Search className="h-5 w-5" />
                      Найти заказы
                    </Button>
                  </Link>
                  <Link href="/my/offers">
                    <Button variant="secondary" className="w-full gap-2">
                      <Briefcase className="h-5 w-5" />
                      Мои предложения
                    </Button>
                  </Link>
                </>
              )}
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-4 w-4" />
                Редактировать профиль
              </Button>
              <Button
                variant="ghost"
                className="w-full gap-2 text-danger"
                disabled={!user}
                onClick={async () => {
                  if (!user) return;
                  await signOut();
                  router.push("/");
                }}
              >
                <LogOut className="h-4 w-4" />
                Выйти
              </Button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
