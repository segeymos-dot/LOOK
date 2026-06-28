"use client";

import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { isDemoMode } from "@/lib/config";
import { mapAuthErrorT } from "@/lib/i18n/client-messages";
import { useTranslation } from "@/components/providers/LocaleProvider";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Mail } from "lucide-react";

type EmailInfo = {
  requiresEmailConfirmation?: boolean;
  isDevelopment?: boolean;
  callbackUrl?: string;
  devHint?: string | null;
  redirectUrlsHint?: string | null;
};

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const demo = isDemoMode();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailInfo, setEmailInfo] = useState<EmailInfo | null>(null);

  useEffect(() => {
    if (demo) return;
    void fetch("/api/auth/email-info")
      .then((res) => res.json())
      .then((data: EmailInfo) => setEmailInfo(data))
      .catch(() => undefined);
  }, [demo]);

  const handleResend = async () => {
    if (!email || demo) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    const res = await fetch("/api/auth/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const result = await res.json();

    setLoading(false);

    if (!res.ok) {
      setError(mapAuthErrorT(result.error ?? t("auth.checkEmail.resendError"), t));
      return;
    }

    setMessage(t("auth.checkEmail.resendSuccess"));
  };

  return (
    <AuthLayout
      title={t("auth.checkEmail.title")}
      subtitle={t("auth.checkEmail.subtitle")}
      footer={
        <p className="text-center text-sm text-text-secondary">
          <Link href="/login" className="font-semibold text-brand-600">
            {t("auth.checkEmail.toLogin")}
          </Link>
        </p>
      }
    >
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Mail className="h-7 w-7" />
        </div>

        <p className="text-sm text-text-secondary">
          {email
            ? t("auth.checkEmail.bodyWithEmail", { email })
            : t("auth.checkEmail.bodyGeneric")}
        </p>

        <p className="text-xs text-text-muted">
          {t("auth.checkEmail.afterConfirm")}
          {emailInfo?.callbackUrl ? (
            <>
              {" "}
              {t("auth.checkEmail.callbackHint", { url: emailInfo.callbackUrl })}
            </>
          ) : null}
        </p>

        {emailInfo?.isDevelopment && emailInfo.devHint && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-left text-xs text-amber-900">
            <p className="font-semibold">{t("auth.checkEmail.devMode")}</p>
            <p className="mt-1">{emailInfo.devHint}</p>
            {emailInfo.redirectUrlsHint ? (
              <p className="mt-2 text-amber-800">{emailInfo.redirectUrlsHint}</p>
            ) : null}
          </div>
        )}

        {message && <p className="text-sm text-emerald-700">{message}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}

        {email && !demo && (
          <Button
            type="button"
            variant="secondary"
            loading={loading}
            className="w-full"
            onClick={handleResend}
          >
            {t("auth.checkEmail.resend")}
          </Button>
        )}

        <Link href="/login">
          <Button className="w-full">{t("auth.checkEmail.toLoginBtn")}</Button>
        </Link>
      </div>
    </AuthLayout>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense>
      <CheckEmailContent />
    </Suspense>
  );
}
