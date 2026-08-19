"use client";

import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { syncClientSession } from "@/lib/auth/sync-client-session";
import { isDemoMode } from "@/lib/config";
import { createRegisterSchema, mapAuthErrorT } from "@/lib/i18n/client-messages";
import {
  clearRegisterPreConsent,
  readRegisterPreConsent,
  writeRegisterPreConsent,
} from "@/lib/legal/register-preconsent";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Phase = "legal" | "form";

export default function RegisterPage() {
  const router = useRouter();
  const { syncSession } = useAuth();
  const { t, locale } = useTranslation();
  const demo = isDemoMode();
  const registerSchema = useMemo(() => createRegisterSchema(t), [t]);

  const [hydrated, setHydrated] = useState(false);
  const [phase, setPhase] = useState<Phase>("legal");
  const [legalChecked, setLegalChecked] = useState(false);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    country: "",
    city: "",
    avatar_url: "",
    role: "customer" as const,
    bio: "",
    skills: "",
    portfolio: "",
    provider_category_slugs: [] as string[],
  });

  const totalSteps = 2;

  useEffect(() => {
    setErrors({});
  }, [locale]);

  useEffect(() => {
    const existing = readRegisterPreConsent();
    if (existing) {
      setPhase("form");
      setLegalChecked(true);
    } else {
      setPhase("legal");
      setLegalChecked(false);
      setStep(0);
    }
    setHydrated(true);
  }, []);

  const continueFromLegal = () => {
    if (!legalChecked) {
      setErrors({ acceptedTerms: t("validation.acceptTerms") });
      return;
    }
    writeRegisterPreConsent();
    setErrors({});
    setStep(0);
    setPhase("form");
  };

  const backToLegal = () => {
    clearRegisterPreConsent();
    setLegalChecked(false);
    setStep(0);
    setPhase("legal");
    setErrors({});
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});

    const preConsent = readRegisterPreConsent();
    if (!preConsent) {
      setPhase("legal");
      setLegalChecked(false);
      setErrors({ acceptedTerms: t("validation.acceptTerms") });
      return;
    }

    const parsed = registerSchema.safeParse({
      ...form,
      role: "customer",
      acceptedTerms: true,
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

    if (demo) {
      clearRegisterPreConsent();
      setLoading(false);
      router.push("/");
      return;
    }

    const response = await fetch("/api/auth/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        role: "customer",
        acceptedTerms: true,
      }),
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      setLoading(false);
      setErrors({
        form: mapAuthErrorT(result.error ?? t("auth.register.error"), t),
      });
      return;
    }

    clearRegisterPreConsent();

    if (!result.session) {
      setLoading(false);
      router.push(`/check-email?email=${encodeURIComponent(result.email ?? form.email)}`);
      return;
    }

    await syncClientSession(result.session);
    await syncSession();

    setLoading(false);
    router.push("/");
    router.refresh();
  };

  const nextStep = () => {
    if (!readRegisterPreConsent()) {
      setPhase("legal");
      setLegalChecked(false);
      return;
    }
    if (step === 0) {
      if (form.full_name.length < 2) {
        setErrors({ full_name: t("validation.minName") });
        return;
      }
      if (!form.email.includes("@")) {
        setErrors({ email: t("validation.emailInvalid") });
        return;
      }
      if (form.password.length < 6) {
        setErrors({ password: t("validation.minPassword") });
        return;
      }
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, totalSteps - 1));
  };

  if (!hydrated) {
    return (
      <AuthLayout title={t("legal.preRegisterTitle")} subtitle={t("common.loading")}>
        <p className="text-sm text-text-muted">{t("common.loading")}</p>
      </AuthLayout>
    );
  }

  if (phase === "legal") {
    return (
      <AuthLayout
        title={t("legal.preRegisterTitle")}
        subtitle={t("legal.preRegisterSubtitle")}
        footer={
          <div className="space-y-2 text-center text-sm text-text-secondary">
            <p>
              {t("auth.register.hasAccount")}{" "}
              <Link href="/login" className="font-semibold text-brand-600">
                {t("auth.register.login")}
              </Link>
            </p>
          </div>
        }
      >
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-text-secondary">
            {t("legal.preRegisterBody")}
          </p>

          <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface-muted/50 px-4 py-4">
            <Link
              href="/terms?from=register"
              className="block min-h-11 text-base font-semibold text-brand-600"
            >
              {t("legal.termsLink")}
            </Link>
            <Link
              href="/privacy?from=register"
              className="block min-h-11 text-base font-semibold text-brand-600"
            >
              {t("legal.privacyLink")}
            </Link>
          </div>

          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={legalChecked}
              onChange={(e) => setLegalChecked(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-border text-brand-600 focus:ring-brand-500"
              required
            />
            <span className="leading-snug">
              {t("legal.acceptBeforeTerms")}{" "}
              <Link
                href="/terms?from=register"
                className="font-semibold text-brand-600"
                onClick={(e) => e.stopPropagation()}
              >
                {t("legal.termsLink")}
              </Link>{" "}
              {t("legal.acceptBetween")}{" "}
              <Link
                href="/privacy?from=register"
                className="font-semibold text-brand-600"
                onClick={(e) => e.stopPropagation()}
              >
                {t("legal.privacyLink")}
              </Link>
              {t("legal.acceptAfterPrivacy")
                ? ` ${t("legal.acceptAfterPrivacy")}`
                : ""}
            </span>
          </label>

          {errors.acceptedTerms ? (
            <p className="text-sm text-danger">{errors.acceptedTerms}</p>
          ) : null}

          <Button
            type="button"
            disabled={!legalChecked}
            onClick={continueFromLegal}
            className="w-full"
          >
            {t("legal.preRegisterContinue")}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("auth.register.title")}
      subtitle={`${t("auth.register.step")} ${step + 1} / ${totalSteps}`}
      banner={
        demo ? (
          <p className="mt-3 rounded-xl bg-warning-bg px-3 py-2 text-sm text-amber-800">
            {t("auth.register.demoBanner")}
          </p>
        ) : undefined
      }
      footer={
        <div className="space-y-2 text-center text-sm text-text-secondary">
          <p>
            {t("auth.register.hasAccount")}{" "}
            <Link href="/login" className="font-semibold text-brand-600">
              {t("auth.register.login")}
            </Link>
          </p>
          <p className="text-xs">
            <Link href="/terms?from=register" className="text-brand-600">
              {t("legal.termsLink")}
            </Link>
            {" · "}
            <Link href="/privacy?from=register" className="text-brand-600">
              {t("legal.privacyLink")}
            </Link>
          </p>
        </div>
      }
    >
      <div className="mb-6 flex gap-2">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i <= step ? "gradient-brand" : "bg-slate-200"
            )}
          />
        ))}
      </div>

      <p className="mb-4 text-sm text-text-secondary">
        {t("auth.register.customerDefaultHint")}
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {step === 0 && (
          <div className="space-y-4">
            <Input
              id="full_name"
              label={t("auth.register.name")}
              placeholder={t("auth.register.namePlaceholder")}
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              error={errors.full_name}
            />
            <Input
              id="email"
              name="email"
              label={t("auth.register.email")}
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              error={errors.email}
            />
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              label={t("auth.register.password")}
              placeholder={t("auth.register.passwordPlaceholder")}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              error={errors.password}
            />
            <Input
              id="phone"
              label={t("auth.register.phone")}
              type="tel"
              placeholder={t("auth.register.phonePlaceholder")}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              error={errors.phone}
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                id="country"
                label={t("auth.register.country")}
                placeholder={t("auth.register.countryPlaceholder")}
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
              <Input
                id="city"
                label={t("auth.register.city")}
                placeholder={t("auth.register.cityPlaceholder")}
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <Input
              id="avatar_url"
              label={t("auth.register.avatarUrl")}
              placeholder={t("auth.register.avatarPlaceholder")}
              value={form.avatar_url}
              onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
              error={errors.avatar_url}
              hint={t("auth.register.avatarHint")}
            />
          </div>
        )}

        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

        <div className="flex gap-2 pt-2">
          {step > 0 ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep((s) => s - 1)}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              {t("auth.register.back")}
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={backToLegal}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              {t("auth.register.back")}
            </Button>
          )}
          {step < totalSteps - 1 ? (
            <Button type="button" onClick={nextStep} className="flex-1">
              {t("auth.register.next")}
            </Button>
          ) : (
            <Button type="submit" loading={loading} className="flex-1">
              {t("auth.register.submit")}
            </Button>
          )}
        </div>
      </form>
    </AuthLayout>
  );
}
