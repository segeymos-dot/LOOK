"use client";

import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { getClientAppOrigin } from "@/lib/app-url";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { mapAuthError } from "@/lib/test-auth";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Mail } from "lucide-react";

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const demo = isDemoMode();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResend = async () => {
    if (!email || demo) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const origin = getClientAppOrigin();
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/`,
      },
    });

    setLoading(false);

    if (resendError) {
      setError(mapAuthError(resendError.message));
      return;
    }

    setMessage("Письмо отправлено повторно. Проверьте почту.");
  };

  return (
    <AuthLayout
      title="Проверьте вашу почту"
      subtitle="Мы отправили письмо для подтверждения регистрации"
      footer={
        <p className="text-center text-sm text-text-secondary">
          <Link href="/login" className="font-semibold text-brand-600">
            Перейти ко входу
          </Link>
        </p>
      }
    >
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Mail className="h-7 w-7" />
        </div>

        <p className="text-sm text-text-secondary">
          {email ? (
            <>
              Откройте письмо на адресе <strong>{email}</strong> и нажмите ссылку подтверждения,
              чтобы активировать аккаунт LOOK.
            </>
          ) : (
            <>Откройте письмо от LOOK и нажмите ссылку подтверждения, чтобы активировать аккаунт.</>
          )}
        </p>

        <p className="text-xs text-text-muted">
          После подтверждения вы сможете войти и пользоваться сервисом.
        </p>

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
            Отправить письмо повторно
          </Button>
        )}

        <Link href="/login">
          <Button className="w-full">Ко входу</Button>
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
