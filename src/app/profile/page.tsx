"use client";

import { PaymentHistoryList } from "@/components/finance/PaymentHistoryList";
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
import { useTranslation } from "@/components/providers/LocaleProvider";
import { isDemoMode } from "@/lib/config";
import { LOOK_OFFICIAL_WEBSITE_URL } from "@/lib/brand/official-site";
import {
  canActAsCustomer,
  canActAsProvider,
} from "@/lib/auth/roles";
import { getMockReviewsForProvider, mockCategories } from "@/lib/mock/data";
import { getProviderVerification } from "@/lib/profile/provider-utils";
import { createClient } from "@/lib/supabase/client";
import { getRoleLabelT, mapUserFacingErrorT } from "@/lib/i18n/client-messages";
import type { Category, PortfolioItem, Review } from "@/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  BarChart3,
  Building2,
  ClipboardList,
  ExternalLink,
  Globe,
  Headphones,
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
  const { t } = useTranslation();
  const router = useRouter();
  const resolvedProfile = displayProfile ?? profile;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
    portfolio: "",
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
        portfolio: resolvedProfile.portfolio ?? "",
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
    setSaveError(null);

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
        portfolio: form.portfolio || null,
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
        setSaveError(mapUserFacingErrorT(error.message, t));
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

  if (!ready) {
    return (
      <AppLayout activePath="/profile" title={t("profile.title")}>
        <div className="flex flex-col items-center justify-center px-4 py-20">
          <p className="text-text-secondary">{t("profile.loading")}</p>
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout activePath="/profile" title={t("profile.title")}>
        <div className="flex flex-col items-center justify-center px-4 py-20">
          <Avatar name="?" size="xl" className="mb-4 opacity-50" />
          <p className="mb-4 text-text-secondary">{t("profile.loginRequired")}</p>
          <Link href="/login?redirect=/profile">
            <Button>{t("profile.loginBtn")}</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout activePath="/profile" title={t("profile.title")}>
      <div className="space-y-5 p-4">
        <Card padding="lg" className="text-center">
          <Avatar
            src={resolvedProfile?.avatar_url}
            name={resolvedProfile?.full_name ?? user?.email ?? t("common.user")}
            size="xl"
            ring
            className="mx-auto"
          />
          <h1 className="mt-4 text-xl font-bold tracking-tight">
            {resolvedProfile?.full_name ?? user?.email ?? t("profile.title")}
          </h1>
          <Chip variant="brand" className="mt-2">
            {getRoleLabelT(resolvedProfile?.role, t)}
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
                {t("profile.publicProfile")}
              </Button>
            </Link>
          )}
        </Card>

        {!editing && (
          <Card padding="md" className="space-y-3">
            <h2 className="text-sm font-semibold text-text-primary">{t("profile.financeTest")}</h2>
            <div className="grid gap-2">
              {showProviderSection && (
                <Link href="/my/balance">
                  <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                    <Wallet className="h-4 w-4" />
                    {t("profile.providerBalance")}
                  </Button>
                </Link>
              )}
              {(isPlatformAdmin || isDemoMode()) && (
                <>
                  <Link href="/admin/stats">
                    <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                      <BarChart3 className="h-4 w-4" />
                      {t("profile.adminStats")}
                    </Button>
                  </Link>
                  <Link href="/admin/support">
                    <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                      <Headphones className="h-4 w-4" />
                      {t("home.trustSupport")}
                    </Button>
                  </Link>
                  <Link href="/admin/platform">
                    <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                      <Building2 className="h-4 w-4" />
                      {t("profile.adminPlatform")}
                    </Button>
                  </Link>
                </>
              )}
              <Link href="/finance/transactions">
                <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                  <History className="h-4 w-4" />
                  {t("profile.transactions")}
                </Button>
              </Link>
            </div>
            <PaymentHistoryList />
          </Card>
        )}

        {editing ? (
          <Card padding="md">
            <form onSubmit={handleSave} className="space-y-4">
              {user && (
                <AvatarUpload
                  userId={user.id}
                  name={form.full_name || t("common.user")}
                  value={form.avatar_url || null}
                  onChange={(url) => setForm({ ...form, avatar_url: url })}
                />
              )}
              <Input
                id="full_name"
                label={t("profile.name")}
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
              <Input
                id="phone"
                label={t("profile.phone")}
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  id="city"
                  label={t("profile.city")}
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
                <Input
                  id="country"
                  label={t("profile.country")}
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                />
              </div>
              <Textarea
                id="bio"
                label={t("profile.bio")}
                rows={3}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
              <Select
                id="role"
                label={t("profile.role")}
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as typeof form.role })
                }
              >
                <option value="customer">{t("role.customer")}</option>
                <option value="provider">{t("role.provider")}</option>
                <option value="both">{t("role.both")}</option>
              </Select>

              {(form.role === "provider" || form.role === "both") && user && (
                <>
                  <Input
                    id="skills"
                    label={t("profile.skills")}
                    placeholder={t("profile.skillsHint")}
                    value={form.skills}
                    onChange={(e) => setForm({ ...form, skills: e.target.value })}
                  />
                  <Textarea
                    id="portfolio"
                    label={t("profile.portfolio")}
                    placeholder={t("profile.portfolioPlaceholder")}
                    rows={3}
                    value={form.portfolio}
                    onChange={(e) => setForm({ ...form, portfolio: e.target.value })}
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

              {saveError && <p className="text-sm text-danger">{saveError}</p>}

              <div className="flex gap-2 pt-2">
                <Button type="submit" loading={saving} className="flex-1">
                  {t("common.save")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setSaveError(null);
                    setEditing(false);
                  }}
                >
                  {t("common.cancel")}
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
                <h3 className="mb-2 text-sm font-semibold text-text-primary">{t("profile.skills")}</h3>
                <div className="flex flex-wrap gap-2">
                  {resolvedProfile.skills.split(",").map((skill) => (
                    <Chip key={skill.trim()}>{skill.trim()}</Chip>
                  ))}
                </div>
              </Card>
            )}

            {showProviderSection && resolvedProfile?.portfolio?.trim() && (
              <Card padding="md">
                <h3 className="mb-2 text-sm font-semibold text-text-primary">{t("profile.portfolio")}</h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-text-secondary">
                  {resolvedProfile.portfolio}
                </p>
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
                    {t("profile.myRequests")}
                  </Button>
                </Link>
              )}
              {canActAsProvider(resolvedProfile?.role) && (
                <>
                  <Link href="/search">
                    <Button variant="secondary" className="w-full gap-2">
                      <Search className="h-5 w-5" />
                      {t("profile.findOrders")}
                    </Button>
                  </Link>
                  <Link href="/my/offers">
                    <Button variant="secondary" className="w-full gap-2">
                      <Briefcase className="h-5 w-5" />
                      {t("profile.myOffers")}
                    </Button>
                  </Link>
                </>
              )}
              <a
                href={LOOK_OFFICIAL_WEBSITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 text-base font-semibold text-text-primary transition-all hover:border-brand-300 hover:bg-brand-50"
              >
                <Globe className="h-4 w-4" />
                {t("profile.officialSite")}
                <ExternalLink className="h-4 w-4 opacity-70" aria-hidden />
              </a>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => {
                  setSaveError(null);
                  setEditing(true);
                }}
              >
                <Pencil className="h-4 w-4" />
                {t("profile.edit")}
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
                {t("profile.logout")}
              </Button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
