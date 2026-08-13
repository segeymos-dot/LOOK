"use client";

import { BecomeProviderCard } from "@/components/auth/BecomeProviderCard";
import { UiModeSwitch } from "@/components/auth/UiModeSwitch";
import { ProfileFinanceBlock } from "@/components/finance/ProfileFinanceBlock";
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
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/config";
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
  History,
  Inbox,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Pencil,
  Scale,
  Search,
  Settings,
  Users,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

export default function ProfilePage() {
  const {
    user,
    profile,
    displayProfile,
    ready,
    syncSession,
    signOut,
    setProfile,
    isPlatformAdmin,
    effectiveUiMode,
    canSwitchUiMode,
  } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const resolvedProfile = displayProfile ?? profile;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Avoid flashing guest shell while auth cookies rehydrate after login. */
  const [authSettled, setAuthSettled] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [incomingPendingCount, setIncomingPendingCount] = useState(0);
  const [customerOrdersCount, setCustomerOrdersCount] = useState(0);
  const [customerReviewsCount, setCustomerReviewsCount] = useState(0);
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

  const showProviderSection = canActAsProvider(resolvedProfile?.role);
  const showCustomerSection = canActAsCustomer(resolvedProfile?.role);
  // Shell follows local UI mode; APIs stay role-capable for deep links.
  const showCustomerUi =
    showCustomerSection && effectiveUiMode === "customer";
  const showProviderUi =
    showProviderSection && effectiveUiMode === "provider";
  const showCustomerLinks = showCustomerUi;
  const showProviderLinks = showProviderUi;

  useEffect(() => {
    if (!ready) {
      setAuthSettled(false);
      return;
    }
    if (user) {
      setAuthSettled(true);
      return;
    }

    let cancelled = false;
    setAuthSettled(false);
    void (async () => {
      try {
        await syncSession();
      } catch {
        // ignore — guest UI only after grace
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (!cancelled) setAuthSettled(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, user, syncSession]);

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

  /** Customer-mode stats: orders as customer + reviews received as customer. */
  useEffect(() => {
    if (!ready || !user || !showCustomerUi) {
      setCustomerOrdersCount(0);
      setCustomerReviewsCount(0);
      return;
    }
    if (isDemoMode()) {
      setCustomerOrdersCount(0);
      setCustomerReviewsCount(0);
      return;
    }

    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const [ordersRes, reviewsRes] = await Promise.all([
        authFetch(
          "/api/orders/history?viewer=customer&tab=completed&page=1&pageSize=1"
        ),
        // Reviews of this user as customer (not as provider):
        // provider profile reviews set provider_id === reviewee_id.
        supabase
          .from("reviews")
          .select("id", { count: "exact", head: true })
          .eq("reviewee_id", user.id)
          .neq("provider_id", user.id),
      ]);

      if (cancelled) return;

      if (ordersRes.ok) {
        const data = (await ordersRes.json()) as { total?: number };
        setCustomerOrdersCount(Number(data.total ?? 0));
      } else {
        setCustomerOrdersCount(0);
      }

      setCustomerReviewsCount(Number(reviewsRes.count ?? 0));
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, user, showCustomerUi]);

  useEffect(() => {
    if (!ready || !user || !resolvedProfile || !showProviderUi) {
      setIncomingPendingCount(0);
      return;
    }
    if (isDemoMode()) {
      setIncomingPendingCount(0);
      return;
    }

    let cancelled = false;
    void (async () => {
      const res = await authFetch("/api/provider/incoming?countOnly=1");
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { pendingCount?: number };
      if (!cancelled) setIncomingPendingCount(Number(data.pendingCount ?? 0));
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, user, resolvedProfile, showProviderUi]);

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
      // Role is never edited here — customer→both goes through provider onboarding.
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
          data: { full_name: data.full_name },
        });
      }
    } else if (resolvedProfile) {
      setProfile({
        ...resolvedProfile,
        ...form,
        role: resolvedProfile.role,
        phone_verified: Boolean(form.phone?.trim()),
      });
    }

    setSaving(false);
    setEditing(false);
  };

  const verification = resolvedProfile
    ? getProviderVerification(resolvedProfile, Boolean(user?.email_confirmed_at))
    : null;

  if (!ready || !authSettled) {
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

          {showProviderUi && resolvedProfile && (
            <div className="mt-4">
              <ProviderStats
                rating={Number(resolvedProfile.rating)}
                completedOrders={resolvedProfile.completed_orders_count}
                reviewsCount={resolvedProfile.reviews_count}
                variant="compact"
              />
            </div>
          )}

          {showCustomerUi && (
            <div className="mt-4">
              <ProviderStats
                rating={0}
                completedOrders={customerOrdersCount}
                reviewsCount={customerReviewsCount}
                variant="compact"
              />
            </div>
          )}

          {verification && showProviderUi && (
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

          {showProviderUi && resolvedProfile && !editing && (
            <Link href={`/providers/${resolvedProfile.id}`} className="mt-4 inline-block">
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                {t("profile.publicProfile")}
              </Button>
            </Link>
          )}
        </Card>

        {!editing && canSwitchUiMode && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-muted">{t("uiMode.hint")}</p>
            <UiModeSwitch />
          </div>
        )}

        {!editing && <BecomeProviderCard />}

        {!editing && (showProviderUi || showCustomerUi) && (
          <ProfileFinanceBlock
            showProvider={showProviderUi}
            showCustomer={showCustomerUi}
            adminLinks={
              isPlatformAdmin || isDemoMode() ? (
                <>
                  <Link href="/admin/stats">
                    <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                      <BarChart3 className="h-4 w-4" />
                      {t("profile.adminStats")}
                    </Button>
                  </Link>
                  <Link href="/admin/platform">
                    <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                      <Building2 className="h-4 w-4" />
                      {t("profile.adminPlatform")}
                    </Button>
                  </Link>
                  <Link href="/admin/orders">
                    <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                      <ClipboardList className="h-4 w-4" />
                      {t("profile.allOrderHistory")}
                    </Button>
                  </Link>
                  <Link href="/admin/disputes">
                    <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                      <Scale className="h-4 w-4" />
                      {t("profile.adminDisputes")}
                    </Button>
                  </Link>
                  <Link href="/admin/customers">
                    <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                      <Users className="h-4 w-4" />
                      {t("profile.adminCustomers")}
                    </Button>
                  </Link>
                  <Link href="/admin/providers">
                    <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                      <UserRound className="h-4 w-4" />
                      {t("profile.adminProviders")}
                    </Button>
                  </Link>
                </>
              ) : undefined
            }
          />
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
              <div>
                <p className="mb-1 text-sm font-medium text-text-primary">
                  {t("profile.role")}
                </p>
                <p className="rounded-xl border border-border-subtle bg-slate-50 px-3 py-2 text-sm text-text-secondary">
                  {getRoleLabelT(resolvedProfile?.role, t)}
                </p>
                <p className="mt-1 text-xs text-text-muted">{t("profile.roleLockedHint")}</p>
              </div>

              {showProviderUi && user && (
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

            {showProviderUi && resolvedProfile?.skills && (
              <Card padding="md">
                <h3 className="mb-2 text-sm font-semibold text-text-primary">{t("profile.skills")}</h3>
                <div className="flex flex-wrap gap-2">
                  {resolvedProfile.skills.split(",").map((skill) => (
                    <Chip key={skill.trim()}>{skill.trim()}</Chip>
                  ))}
                </div>
              </Card>
            )}

            {showProviderUi && resolvedProfile?.portfolio?.trim() && (
              <Card padding="md">
                <h3 className="mb-2 text-sm font-semibold text-text-primary">{t("profile.portfolio")}</h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-text-secondary">
                  {resolvedProfile.portfolio}
                </p>
              </Card>
            )}

            {showProviderUi &&
              resolvedProfile &&
              (resolvedProfile.portfolio_items?.length ?? 0) > 0 && (
              <PortfolioGallery items={resolvedProfile.portfolio_items} />
            )}

            {showProviderUi && reviews.length > 0 && (
              <ReviewsList reviews={reviews} />
            )}

            <div className="space-y-2">
              {showCustomerLinks && (
                <>
                  <Link href="/my/orders">
                    <Button variant="secondary" className="w-full gap-2">
                      <History className="h-5 w-5" />
                      {t("profile.orderHistory")}
                    </Button>
                  </Link>
                  <Link href="/my/requests">
                    <Button variant="secondary" className="w-full gap-2">
                      <ClipboardList className="h-5 w-5" />
                      {t("profile.myRequests")}
                    </Button>
                  </Link>
                </>
              )}
              {showProviderLinks && (
                <>
                  <Link href="/my/incoming">
                    <Button variant="secondary" className="w-full gap-2">
                      <Inbox className="h-5 w-5" />
                      <span className="flex-1 text-left">
                        {incomingPendingCount > 0
                          ? t("profile.incomingOrdersCount", {
                              count: incomingPendingCount,
                            })
                          : t("profile.incomingOrders")}
                      </span>
                      {incomingPendingCount > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white">
                          {incomingPendingCount}
                        </span>
                      )}
                    </Button>
                  </Link>
                  <Link href="/my/work">
                    <Button variant="secondary" className="w-full gap-2">
                      <History className="h-5 w-5" />
                      {t("profile.workHistory")}
                    </Button>
                  </Link>
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
              <Link href="/settings">
                <Button variant="outline" className="w-full gap-2">
                  <Settings className="h-4 w-4" />
                  {t("profile.settings")}
                </Button>
              </Link>
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
                  await signOut({ scope: "local" });
                  router.replace("/login");
                  router.refresh();
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
