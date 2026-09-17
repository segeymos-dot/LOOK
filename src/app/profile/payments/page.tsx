"use client";

import { PaymentMethodsCard } from "@/components/payments/PaymentMethodsCard";
import { PayoutSetupCard } from "@/components/payments/PayoutSetupCard";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { canActAsCustomer, canActAsProvider } from "@/lib/auth/roles";
import { getDefaultBillingUiSnapshot } from "@/lib/payments/billing-ui-state";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

export default function ProfilePaymentsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, profile, displayProfile, ready, isPlatformAdmin } = useAuth();
  const resolved = displayProfile ?? profile;

  const billing = useMemo(() => getDefaultBillingUiSnapshot(), []);

  const showPaymentMethods =
    Boolean(resolved && canActAsCustomer(resolved.role)) || isPlatformAdmin;
  const showPayouts =
    Boolean(resolved && canActAsProvider(resolved.role)) || isPlatformAdmin;

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace(
        `/login?redirect=${encodeURIComponent("/profile/payments")}`
      );
    }
  }, [ready, user, router]);

  if (!ready) {
    return (
      <AppLayout hideNav title={t("paymentsPayouts.title")}>
        <p className="p-4 text-sm text-text-muted">{t("common.loading")}</p>
      </AppLayout>
    );
  }

  if (!user) return null;

  return (
    <AppLayout hideNav activePath="/profile" title={t("paymentsPayouts.title")}>
      <div className="mx-auto w-full max-w-lg space-y-5 p-4 pb-10">
        <PageHeader
          title={t("paymentsPayouts.title")}
          subtitle={t("paymentsPayouts.subtitle")}
          backHref="/profile"
        />

        {!showPaymentMethods && !showPayouts ? (
          <p className="text-sm text-text-secondary">
            {t("paymentsPayouts.unavailable")}{" "}
            <Link href="/profile" className="font-semibold text-brand-600">
              {t("paymentsPayouts.backToProfile")}
            </Link>
          </p>
        ) : null}

        {showPaymentMethods ? (
          <PaymentMethodsCard methods={billing.paymentMethods} />
        ) : null}

        {showPayouts ? (
          <PayoutSetupCard status={billing.payoutStatus} />
        ) : null}
      </div>
    </AppLayout>
  );
}
