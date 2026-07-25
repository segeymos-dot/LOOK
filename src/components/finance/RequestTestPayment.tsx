"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import {
  calculatePaymentSplit,
  formatCommissionPercent,
  getPlatformCommissionRate,
} from "@/lib/config/finance";
import { formatPrice } from "@/lib/utils";
import type { Payment, RequestStatus } from "@/types";
import { CreditCard, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface RequestTestPaymentProps {
  requestId: string;
  requestStatus: RequestStatus;
  customerId: string;
  grossAmount: number;
  currency: string;
  isDemo?: boolean;
  viewerUserId?: string | null;
  viewerIsCustomer?: boolean;
  /** Server-only: ENABLE_TEST_PAYMENTS === "true". Defaults off. */
  allowTestPayments?: boolean;
}

export function RequestTestPayment({
  requestId,
  requestStatus,
  customerId,
  grossAmount,
  currency,
  isDemo = false,
  viewerUserId,
  viewerIsCustomer,
  allowTestPayments = false,
}: RequestTestPaymentProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner =
    viewerIsCustomer ??
    (isDemo ? viewerUserId === customerId : user?.id === customerId);

  const rate = getPlatformCommissionRate();
  const split = calculatePaymentSplit(grossAmount, rate);

  useEffect(() => {
    if (!allowTestPayments || !isOwner || requestStatus !== "in_progress") return;

    const load = async () => {
      setLoading(true);
      try {
        const res = await authFetch(`/api/finance/payments/${requestId}`);
        const data = await res.json();
        if (data.payment) setPayment(data.payment);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [allowTestPayments, requestId, isOwner, requestStatus]);

  if (!allowTestPayments || !isOwner || requestStatus !== "in_progress") return null;

  const handlePay = async () => {
    setError(null);
    setPayLoading(true);
    try {
      const res = await authFetch(`/api/finance/payments/${requestId}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("finance.payment.error"));
        return;
      }
      setPayment({
        id: data.payment_id,
        request_id: requestId,
        offer_id: "",
        customer_id: customerId,
        provider_id: "",
        amount_gross: data.amount_gross,
        platform_fee: data.platform_fee,
        provider_amount: data.provider_amount,
        currency: data.currency,
        status: "paid",
        payment_method: "test",
        paid_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
      router.refresh();
    } catch {
      setError(t("finance.payment.error"));
    } finally {
      setPayLoading(false);
    }
  };

  return (
    <Card padding="md" className="border-brand-100 bg-gradient-to-br from-brand-50/80 to-surface shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-brand-600" />
        <h3 className="font-semibold text-text-primary">{t("finance.payment.title")}</h3>
      </div>

      {payment?.status === "paid" ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            {t("finance.paymentStatus.paid")} — {formatPrice(payment.amount_gross, payment.currency)}
          </div>
          <p className="text-sm text-text-secondary">
            {t("finance.payment.splitNote", {
              rate: formatCommissionPercent(rate),
              fee: formatPrice(payment.platform_fee, payment.currency),
              amount: formatPrice(payment.provider_amount, payment.currency),
            })}
          </p>
          <p className="text-xs text-text-muted">{t("finance.payment.completeHint")}</p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-text-secondary">
            {t("finance.payment.simulateDesc", { rate: formatCommissionPercent(rate) })}
          </p>
          <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl bg-surface p-2 shadow-sm">
              <p className="font-bold text-text-primary">{formatPrice(split.gross, currency)}</p>
              <p className="text-text-muted">{t("finance.payment.customerLabel")}</p>
            </div>
            <div className="rounded-xl bg-surface p-2 shadow-sm">
              <p className="font-bold text-brand-600">{formatPrice(split.platformFee, currency)}</p>
              <p className="text-text-muted">{t("finance.payment.platformLabel")}</p>
            </div>
            <div className="rounded-xl bg-surface p-2 shadow-sm">
              <p className="font-bold text-emerald-700">
                {formatPrice(split.providerAmount, currency)}
              </p>
              <p className="text-text-muted">{t("finance.payment.providerLabel")}</p>
            </div>
          </div>
          {error && (
            <p className="mb-3 rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
          )}
          <Button
            className="w-full gap-2"
            loading={payLoading || loading}
            onClick={handlePay}
          >
            <CreditCard className="h-4 w-4" />
            {t("finance.payment.payTest", { amount: formatPrice(split.gross, currency) })}
          </Button>
        </>
      )}
    </Card>
  );
}
