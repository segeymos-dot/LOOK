"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  OrderPaymentCheckout,
  type CheckoutCardInput,
} from "@/components/finance/OrderPaymentCheckout";
import { OrderPaymentStatusBadge } from "@/components/finance/OrderPaymentStatusBadge";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { useOrderPayment } from "@/hooks/useOrderPayment";
import {
  calculatePaymentSplit,
  formatCommissionPercent,
  getPlatformCommissionRate,
} from "@/lib/config/finance";
import { formatPrice } from "@/lib/utils";
import type { OrderPaymentStatus } from "@/types";
import { CreditCard, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface OrderPaymentScreenProps {
  requestId: string;
  requestTitle: string;
  customerId: string;
  grossAmount: number;
  currency: string;
  initialOrderPaymentStatus?: OrderPaymentStatus;
  /** Server-only: ENABLE_TEST_PAYMENTS === "true". Never from NEXT_PUBLIC_*. */
  allowTestPayments?: boolean;
}

export function OrderPaymentScreen({
  requestId,
  requestTitle,
  customerId,
  grossAmount,
  currency,
  initialOrderPaymentStatus = "unpaid",
  allowTestPayments = false,
}: OrderPaymentScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [localOrderPaymentStatus, setLocalOrderPaymentStatus] =
    useState<OrderPaymentStatus>(initialOrderPaymentStatus);
  const confirmAttempted = useRef(false);

  const {
    payment,
    isPaid,
    isCompleted,
    pay,
    beginPayment,
    startStripeCheckout,
    confirmStripeSession,
    refresh,
    orderPaymentStatus: liveOrderPaymentStatus,
  } = useOrderPayment(requestId, true);

  const rate = getPlatformCommissionRate();
  const split = calculatePaymentSplit(grossAmount, rate);
  const isOwner = user?.id === customerId;
  const orderPaymentStatus = liveOrderPaymentStatus ?? localOrderPaymentStatus;
  const paid =
    isPaid || orderPaymentStatus === "paid" || orderPaymentStatus === "completed";
  const completed = isCompleted || orderPaymentStatus === "completed";

  useEffect(() => {
    const success = searchParams.get("success");
    const sessionId = searchParams.get("session_id");
    const canceled = searchParams.get("canceled");

    if (canceled === "1") {
      setError(t("finance.payment.canceled"));
      return;
    }

    // Redirect query params alone never mark the order paid.
    // Only a verified server confirm (or webhook + refresh) can.
    if (success !== "1" || !sessionId || confirmAttempted.current) return;
    confirmAttempted.current = true;
    setConfirming(true);
    setError(null);

    void confirmStripeSession(sessionId)
      .then(async (result) => {
        if (result) {
          setLocalOrderPaymentStatus(result.order_payment_status ?? "paid");
          router.replace(`/requests/${requestId}?paid=1`);
          router.refresh();
          return;
        }
        await refresh();
      })
      .catch(async (e: unknown) => {
        // Webhook may have already confirmed — refresh once before showing error.
        await refresh();
        setError(e instanceof Error ? e.message : t("finance.payment.error"));
      })
      .finally(() => setConfirming(false));
  }, [searchParams, confirmStripeSession, refresh, requestId, router, t]);

  if (!isOwner) {
    return (
      <Card padding="md">
        <p className="text-sm text-text-secondary">{t("finance.payment.unauthorized")}</p>
        <Link href={`/requests/${requestId}`} className="mt-3 inline-block text-sm text-brand-600">
          {t("common.back")}
        </Link>
      </Card>
    );
  }

  const handlePayClick = async () => {
    setError(null);
    setPaying(true);
    try {
      const checkout = await startStripeCheckout();
      if (checkout.ok) {
        window.location.href = checkout.url;
        return;
      }

      if (!allowTestPayments || !checkout.useTestFallback) {
        setError(checkout.error);
        return;
      }

      // Fallback: local test checkout only when ENABLE_TEST_PAYMENTS=true.
      const begun = await beginPayment();
      if (!begun) {
        setError(t("finance.payment.error"));
        return;
      }
      setLocalOrderPaymentStatus("payment_pending");
      setCheckoutOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("finance.payment.error"));
    } finally {
      setPaying(false);
    }
  };

  const handlePay = async (card: CheckoutCardInput) => {
    const txnId = `test_txn_${Date.now()}_${card.cardNumber.replace(/\D/g, "").slice(-4)}`;
    await pay(txnId);
    setLocalOrderPaymentStatus("paid");
    router.push(`/requests/${requestId}?paid=1`);
    router.refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t("finance.paymentPage.title")} backHref={`/requests/${requestId}`} />

      <Card padding="lg" className="shadow-card">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {t("finance.paymentPage.orderLabel")}
            </p>
            <h1 className="text-lg font-bold text-text-primary">{requestTitle}</h1>
          </div>
          <OrderPaymentStatusBadge status={paid ? "paid" : orderPaymentStatus} />
        </div>

        {confirming ? (
          <div className="rounded-xl bg-surface-muted p-4 text-sm text-text-secondary">
            {t("finance.payment.confirmingStripe")}
          </div>
        ) : completed ? (
          <div className="space-y-3 rounded-xl bg-blue-50 p-4">
            <div className="flex items-center gap-2 text-blue-800">
              <ShieldCheck className="h-5 w-5" />
              <span className="font-semibold">{t("finance.orderPaymentStatus.completed")}</span>
            </div>
            <OrderPaymentStatusBadge status="completed" />
            <Link href={`/requests/${requestId}`}>
              <Button variant="secondary" className="w-full">
                {t("finance.paymentPage.backToOrder")}
              </Button>
            </Link>
          </div>
        ) : paid ? (
          <div className="space-y-3 rounded-xl bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-emerald-800">
              <ShieldCheck className="h-5 w-5" />
              <span className="font-semibold">{t("finance.paymentStatus.paid")}</span>
            </div>
            <p className="text-sm text-emerald-900">
              {formatPrice(payment?.amount_gross ?? split.gross, currency)}
              {payment?.paid_at || payment?.id ? (
                <>
                  {" · "}
                  {payment?.paid_at
                    ? new Date(payment.paid_at).toLocaleString()
                    : null}
                </>
              ) : null}
            </p>
            {payment?.id && (
              <p className="text-xs text-text-muted">
                {t("finance.payment.transactionId")}: {payment.external_reference ?? payment.id}
              </p>
            )}
            <Link href={`/requests/${requestId}`}>
              <Button variant="secondary" className="w-full">
                {t("finance.paymentPage.backToOrder")}
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-text-secondary">
              {t("finance.paymentPage.summaryDesc", { rate: formatCommissionPercent(rate) })}
            </p>

            <div className="mb-4 space-y-2 rounded-xl border border-border-subtle bg-surface-muted p-4 text-sm">
              <Row label={t("finance.paymentPage.orderAmount")} value={formatPrice(split.gross, currency)} />
              <Row
                label={t("finance.paymentPage.commission", { rate: formatCommissionPercent(rate) })}
                value={formatPrice(split.platformFee, currency)}
                muted
              />
              <Row
                label={t("finance.paymentPage.providerPayout")}
                value={formatPrice(split.providerAmount, currency)}
                muted
              />
              <div className="border-t border-border-subtle pt-3">
                <Row
                  label={t("finance.paymentPage.totalDue")}
                  value={formatPrice(split.gross, currency)}
                  bold
                />
              </div>
            </div>

            {allowTestPayments ? (
              <p className="mb-4 flex items-center gap-2 text-xs text-amber-800">
                <Lock className="h-3.5 w-3.5" />
                {t("finance.checkout.stripeOrTestNote")}
              </p>
            ) : null}

            {error && (
              <p className="mb-3 rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
            )}

            <Button
              className="w-full gap-2"
              size="lg"
              loading={paying}
              onClick={() => void handlePayClick()}
            >
              <CreditCard className="h-5 w-5" />
              {t("finance.paymentPage.payNow", { amount: formatPrice(split.gross, currency) })}
            </Button>
          </>
        )}
      </Card>

      {allowTestPayments ? (
        <OrderPaymentCheckout
          open={checkoutOpen}
          amount={split.gross}
          currency={currency}
          onClose={() => setCheckoutOpen(false)}
          onPay={handlePay}
        />
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={muted ? "text-text-muted" : "text-text-secondary"}>{label}</span>
      <span className={bold ? "text-lg font-bold text-text-primary" : "font-semibold text-text-primary"}>
        {value}
      </span>
    </div>
  );
}
