"use client";

import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import { hasCurrentLegalConsent } from "@/lib/legal/consent";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";

function LegalAcceptBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, profileReady, ready, refreshProfile, isPlatformAdmin } =
    useAuth();
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo = searchParams.get("redirect") || "/";

  useEffect(() => {
    if (!ready || !profileReady) return;
    if (!profile) {
      router.replace(`/login?redirect=${encodeURIComponent("/legal/accept")}`);
      return;
    }
    if (isPlatformAdmin || hasCurrentLegalConsent(profile)) {
      router.replace(redirectTo.startsWith("/") ? redirectTo : "/");
    }
  }, [
    ready,
    profileReady,
    profile,
    isPlatformAdmin,
    redirectTo,
    router,
  ]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!accepted) {
      setError(t("validation.acceptTerms"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/auth/legal-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("legal.acceptSaveError"));
        return;
      }
      await refreshProfile();
      router.replace(redirectTo.startsWith("/") ? redirectTo : "/");
      router.refresh();
    } catch {
      setError(t("legal.acceptSaveError"));
    } finally {
      setLoading(false);
    }
  };

  if (!ready || !profileReady || !profile) {
    return (
      <AuthLayout title={t("legal.acceptTitle")} subtitle={t("common.loading")}>
        <p className="text-sm text-text-muted">{t("common.loading")}</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("legal.acceptTitle")}
      subtitle={t("legal.acceptSubtitle")}
    >
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
        <p className="text-sm text-text-secondary">{t("legal.acceptBody")}</p>

        <div className="space-y-1 rounded-2xl border border-border-subtle bg-surface-muted/50 px-4 py-2">
          <Link
            href="/terms?from=legal-accept"
            className="block min-h-11 py-2 text-base font-semibold text-brand-600"
          >
            {t("legal.termsLink")}
          </Link>
          <Link
            href="/privacy?from=legal-accept"
            className="block min-h-11 py-2 text-base font-semibold text-brand-600"
          >
            {t("legal.privacyLink")}
          </Link>
          <Link
            href="/licenses?from=legal-accept"
            className="block min-h-11 py-2 text-base font-semibold text-brand-600"
          >
            {t("legal.licensesLink")}
          </Link>
        </div>

        <label className="flex items-start gap-3 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-border text-brand-600 focus:ring-brand-500"
            required
          />
          <span className="leading-snug">{t("legal.preRegisterCheckbox")}</span>
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <Button
          type="submit"
          loading={loading}
          disabled={!accepted}
          className="w-full"
        >
          {t("legal.acceptContinue")}
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function LegalAcceptPage() {
  return (
    <Suspense fallback={null}>
      <LegalAcceptBody />
    </Suspense>
  );
}
