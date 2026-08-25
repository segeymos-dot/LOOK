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
import { useTranslation } from "@/components/providers/LocaleProvider";
import { canActAsCustomer } from "@/lib/auth/roles";
import { isDemoMode } from "@/lib/config";
import {
  fetchDirectedProviderCard,
  linkRequestToProvider,
  type DirectedProviderCard,
} from "@/lib/data/directed-request";
import { localizeCategoryName } from "@/lib/i18n/localize-data";
import { createClient } from "@/lib/supabase/client";
import { createRequestSchema, mapUserFacingErrorT } from "@/lib/i18n/client-messages";
import { formatRating } from "@/lib/profile/provider-utils";
import type { Category } from "@/types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Star } from "lucide-react";

export function NewRequestPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const providerId = searchParams.get("provider");
  const contactIntent = searchParams.get("intent") === "contact";
  const { displayProfile, loading: authLoading } = useAuth();
  const { t, locale } = useTranslation();
  const requestSchema = useMemo(() => createRequestSchema(t), [t]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [directedProvider, setDirectedProvider] =
    useState<DirectedProviderCard | null>(null);
  const [providerStatus, setProviderStatus] = useState<
    "idle" | "loading" | "ready" | "invalid"
  >("idle");
  const [loading, setLoading] = useState(false);
  /** Sync lock — React setState is too late to stop double-click / double-submit. */
  const submittingRef = useRef(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    title: "",
    description: "",
    category_id: "",
    budget: "",
    location: "",
    deadline: "",
  });

  const newRequestRedirect = useMemo(() => {
    if (!providerId) return "/requests/new";
    const params = new URLSearchParams({ provider: providerId });
    if (contactIntent) params.set("intent", "contact");
    return `/requests/new?${params.toString()}`;
  }, [contactIntent, providerId]);

  useEffect(() => {
    if (isDemoMode()) {
      void import("@/lib/mock/data").then(
        ({ mockCategories, getMockProfile, getMockCategoriesForProvider }) => {
          setCategories(mockCategories);
          if (!providerId) {
            setDirectedProvider(null);
            setProviderStatus("idle");
            return;
          }

          setProviderStatus("loading");
          const provider = getMockProfile(providerId);
          if (!provider || !["provider", "both"].includes(provider.role)) {
            setDirectedProvider(null);
            setProviderStatus("invalid");
            return;
          }

          setDirectedProvider({
            id: provider.id,
            full_name: provider.full_name,
            avatar_url: provider.avatar_url,
            rating: Number(provider.rating ?? 0),
            reviews_count: Number(provider.reviews_count ?? 0),
            completed_orders_count: Number(provider.completed_orders_count ?? 0),
            provider_category_slugs: provider.provider_category_slugs ?? [],
          });
          setProviderStatus("ready");
          const providerCategories = getMockCategoriesForProvider(
            provider.provider_category_slugs
          );
          if (providerCategories[0]) {
            setForm((prev) => ({ ...prev, category_id: providerCategories[0].id }));
          }
        }
      );
      return;
    }

    const supabase = createClient();
    void supabase
      .from("categories")
      .select("*")
      .order("sort_order")
      .then(({ data }) => setCategories(data ?? []));

    if (!providerId) {
      setDirectedProvider(null);
      setProviderStatus("idle");
      return;
    }

    let cancelled = false;
    setProviderStatus("loading");
    void (async () => {
      const card = await fetchDirectedProviderCard(supabase, providerId);
      if (cancelled) return;
      if (!card) {
        setDirectedProvider(null);
        setProviderStatus("invalid");
        return;
      }

      setDirectedProvider(card);
      setProviderStatus("ready");

      const { data: allCategories } = await supabase
        .from("categories")
        .select("*")
        .order("sort_order");
      if (cancelled) return;
      const match = allCategories?.find((cat) =>
        card.provider_category_slugs.includes(cat.slug)
      );
      if (match) {
        setForm((prev) => ({ ...prev, category_id: match.id }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const pageSubtitle = useMemo(() => {
    if (directedProvider) {
      return contactIntent
        ? t("request.contactIntent", { name: directedProvider.full_name })
        : t("request.providerFor", { name: directedProvider.full_name });
    }
    return t("request.newSubtitle");
  }, [contactIntent, directedProvider, t]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || loading) return;
    setErrors({});

    if (providerId && providerStatus === "invalid") {
      setErrors({ form: t("request.forProviderInvalid") });
      return;
    }

    if (providerId && providerStatus === "loading") {
      return;
    }

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

    // Sync lock before any await — blocks double-tap / double-submit.
    submittingRef.current = true;
    setLoading(true);

    try {
      if (isDemoMode()) {
        router.push("/requests/req-1");
        return;
      }

      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        submittingRef.current = false;
        setLoading(false);
        router.push(`/login?redirect=${encodeURIComponent(newRequestRedirect)}`);
        return;
      }

      if (directedProvider && directedProvider.id === user.id) {
        setErrors({ form: t("request.forProviderInvalid") });
        submittingRef.current = false;
        setLoading(false);
        return;
      }

      // Re-validate provider at submit time so the link cannot use a stale/invalid id.
      let linkProviderId: string | null = null;
      if (providerId) {
        const card = await fetchDirectedProviderCard(supabase, providerId);
        if (!card || card.id === user.id) {
          setErrors({ form: t("request.forProviderInvalid") });
          submittingRef.current = false;
          setLoading(false);
          return;
        }
        linkProviderId = card.id;
      }

      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      let requestId: string | null = null;

      const { data: rpcId, error: rpcError } = await supabase.rpc(
        "create_customer_request_idempotent",
        {
          p_title: parsed.data.title,
          p_description: parsed.data.description,
          p_category_id: parsed.data.category_id,
          p_budget_min: parsed.data.budget ?? null,
          p_budget_max: parsed.data.budget ?? null,
          p_currency: "USD",
          p_location: parsed.data.location ?? null,
          p_deadline: parsed.data.deadline ?? null,
          p_idempotency_key: idempotencyKey,
        }
      );

      if (!rpcError && rpcId) {
        requestId = String(rpcId);
      } else {
        // Fallback when migration 052 is not applied yet: client-side recent-dup check + insert.
        if (rpcError) {
          console.warn(
            "[create request] idempotent RPC unavailable, using guarded insert:",
            rpcError.message
          );
        }

        const windowStart = new Date(Date.now() - 15_000).toISOString();
        const { data: recent } = await supabase
          .from("requests")
          .select("id")
          .eq("customer_id", user.id)
          .eq("title", parsed.data.title)
          .is("trashed_at", null)
          .gte("created_at", windowStart)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (recent?.id) {
          requestId = recent.id;
        } else {
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
            .select("id")
            .single();

          if (error || !data) {
            setErrors({
              form: error?.message.includes("row-level security")
                ? t("request.createForbidden")
                : t("request.createError", {
                    message: mapUserFacingErrorT(error?.message ?? "", t),
                  }),
            });
            submittingRef.current = false;
            setLoading(false);
            return;
          }
          requestId = data.id;
        }
      }

      if (!requestId) {
        setErrors({ form: t("request.createError", { message: "empty id" }) });
        submittingRef.current = false;
        setLoading(false);
        return;
      }

      if (linkProviderId) {
        const linked = await linkRequestToProvider(supabase, {
          requestId,
          customerId: user.id,
          providerId: linkProviderId,
        });
        if (!linked.ok) {
          setErrors({
            form: t("request.createError", {
              message: mapUserFacingErrorT(linked.error, t),
            }),
          });
          submittingRef.current = false;
          setLoading(false);
          return;
        }
      }

      // Keep lock through navigation — do not unlock on success.
      router.push(`/requests/${requestId}?created=1`);
    } catch (error) {
      console.error("[create request]", error);
      setErrors({
        form: t("request.createError", {
          message: mapUserFacingErrorT(
            error instanceof Error ? error.message : "",
            t
          ),
        }),
      });
      submittingRef.current = false;
      setLoading(false);
    }
  };

  if (!isDemoMode() && !authLoading && displayProfile && !canActAsCustomer(displayProfile.role)) {
    return (
      <AppLayout activePath="/requests/new" title={t("request.newTitle")}>
        <div className="space-y-4 p-4">
          <PageHeader title={t("request.newTitle")} backHref="/" />
          <Card padding="md" className="border-amber-200 bg-warning-bg">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm text-amber-900">{t("request.customerOnly")}</p>
                <div className="mt-3 flex gap-2">
                  <Link href="/profile">
                    <Button size="sm">{t("profile.title")}</Button>
                  </Link>
                  <Link href="/search">
                    <Button size="sm" variant="secondary">
                      {t("profile.findOrders")}
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
    <AppLayout activePath="/requests/new" title={t("request.newTitle")}>
      <form onSubmit={handleSubmit} className="space-y-5 p-4">
        <PageHeader
          title={t("home.createOrder")}
          subtitle={pageSubtitle}
          backHref={providerId ? `/providers/${providerId}` : "/"}
        />

        {providerId && providerStatus === "loading" && (
          <Card padding="md" className="border-brand-200 bg-brand-50">
            <p className="text-sm text-brand-800">{t("request.forProviderTitle")}…</p>
          </Card>
        )}

        {providerId && providerStatus === "invalid" && (
          <Card padding="md" className="border-amber-200 bg-warning-bg">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-900">{t("request.forProviderInvalid")}</p>
            </div>
          </Card>
        )}

        {directedProvider && providerStatus === "ready" && (
          <Card
            padding="md"
            className="border-2 border-brand-300 bg-brand-50 shadow-card"
            data-testid="directed-provider-card"
          >
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-brand-800">
              {t("request.forProviderTitle")}
            </p>
            <Link
              href={`/providers/${directedProvider.id}`}
              className="flex items-center gap-3"
            >
              <Avatar
                src={directedProvider.avatar_url}
                name={directedProvider.full_name}
                size="lg"
                ring
              />
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-text-primary hover:text-brand-700">
                  {directedProvider.full_name}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                  {t("role.provider")}
                </p>
                {directedProvider.rating > 0 ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-text-primary">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {formatRating(directedProvider.rating)}
                    {directedProvider.reviews_count > 0 && (
                      <span className="font-normal text-text-muted">
                        ({t("review.count", { count: directedProvider.reviews_count })})
                      </span>
                    )}
                  </p>
                ) : null}
              </div>
            </Link>
          </Card>
        )}

        <Card padding="md" className="space-y-4">
          <Input
            id="title"
            label={t("request.orderTitle")}
            placeholder={t("request.titlePlaceholder")}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            error={errors.title}
          />

          <Textarea
            id="description"
            label={t("request.description")}
            placeholder={t("request.descriptionPlaceholder")}
            rows={5}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            error={errors.description}
          />

          <Select
            id="category_id"
            label={t("request.category")}
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            error={errors.category_id}
          >
            <option value="">{t("request.categoryPlaceholder")}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {localizeCategoryName(cat, locale)}
              </option>
            ))}
          </Select>

          <Input
            id="budget"
            label={t("request.budget")}
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
            label={t("request.location")}
            placeholder={t("request.locationPlaceholder")}
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />

          <Input
            id="deadline"
            label={t("request.deadlineOptional")}
            type="date"
            value={form.deadline}
            onChange={(e) => setForm({ ...form, deadline: e.target.value })}
          />
        </Card>

        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

        <Button type="submit" loading={loading} className="w-full" size="lg">
          {t("request.submit")}
        </Button>
      </form>
    </AppLayout>
  );
}
