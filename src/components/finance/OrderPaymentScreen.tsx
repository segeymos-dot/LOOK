"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { OrderPaymentStatusBadge } from "@/components/finance/OrderPaymentStatusBadge";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { useOrderPayment } from "@/hooks/useOrderPayment";
import { authFetch } from "@/lib/auth/client-fetch";
import {
  calculatePaymentSplit,
  formatCommissionPercent,
  getPlatformCommissionRate,
} from "@/lib/config/finance";
import { formatPrice } from "@/lib/utils";
import type { OrderPaymentStatus } from "@/types";
import { CreditCard, ShieldCheck } from "lucide-react";
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
  /** Order marked is_test — show prod-safe TEST PAYMENT UI (no Stripe). */
  isTestOrder?: boolean;
  /** Allowlisted owner may mark unpaid order as is_test (prod-safe path). */
  canMarkAsTest?: boolean;
  /** Server: Stripe secret present. Display-only — does not enable simulated pay. */
  liveCheckoutAvailable?: boolean;
}

export function OrderPaymentScreen({
  requestId,
  requestTitle,
  customerId,
  grossAmount,
  currency,
  initialOrderPaymentStatus = "unpaid",
  allowTestPayments = false,
  isTestOrder = false,
  canMarkAsTest = false,
  liveCheckoutAvailable = true,
}: OrderPaymentScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isPlatformAdmin } = useAuth();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [testPaying, setTestPaying] = useState(false);
  const [markingTest, setMarkingTest] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showTestFallback, setShowTestFallback] = useState(false);
  const [showPayUnavailable, setShowPayUnavailable] = useState(false);
  const [livePayUnavailable, setLivePayUnavailable] = useState(
    !isTestOrder && !liveCheckoutAvailable
  );
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
  const canPay = isOwner || (allowTestPayments && isPlatformAdmin);
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

  if (!canPay) {
    return (
      <Card padding="md">
        <p className="text-sm text-text-secondary">{t("finance.payment.unauthorized")}</p>
        <Link href={`/requests/${requestId}`} className="mt-3 inline-block text-sm text-brand-600">
          {t("common.back")}
        </Link>
      </Card>
    );
  }

  const runSimulatedPayment = async () => {
    // begin_order_payment is owner-only; admins skip straight to simulate_test_payment.
    if (isOwner) {
      const begun = await beginPayment();
      if (begun) setLocalOrderPaymentStatus("payment_pending");
    }
    await pay(`test_pay_${Date.now()}`);
    setLocalOrderPaymentStatus("paid");
    router.push(`/requests/${requestId}?paid=1`);
    router.refresh();
  };

  const handlePayClick = async () => {
    if (paying || testPaying) return;
    setError(null);

    // Test orders never open Stripe — only the explicit test payment path.
    if (isTestOrder && allowTestPayments) {
      setShowTestFallback(true);
      return;
    }

    if (livePayUnavailable || !liveCheckoutAvailable) {
      setLivePayUnavailable(true);
      setShowPayUnavailable(true);
      return;
    }

    setPaying(true);
    try {
      const checkout = await startStripeCheckout();
      if (checkout.ok) {
        window.location.href = checkout.url;
        return;
      }

      if (checkout.stripeNotConfigured) {
        setLivePayUnavailable(true);
        if (allowTestPayments && checkout.useTestFallback) {
          setShowTestFallback(true);
        } else {
          setShowPayUnavailable(true);
        }
        return;
      }

      // Preview/Staging: server signals test fallback when Stripe is missing.
      if (allowTestPayments && checkout.useTestFallback) {
        setShowTestFallback(true);
        return;
      }

      setError(userFacingPaymentError(checkout.error, t("finance.payment.error")));
    } catch (e) {
      setError(
        userFacingPaymentError(
          e instanceof Error ? e.message : t("finance.payment.error"),
          t("finance.payment.error")
        )
      );
    } finally {
      setPaying(false);
    }
  };

  const handleTestPay = async () => {
    if (!allowTestPayments || paying || testPaying) return;
    setError(null);
    setTestPaying(true);
    try {
      await runSimulatedPayment();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("finance.payment.error"));
    } finally {
      setTestPaying(false);
    }
  };

  const handleMarkAsTest = async () => {
    if (!canMarkAsTest || markingTest || isTestOrder) return;
    setError(null);
    setMarkingTest(true);
    try {
      const res = await authFetch(`/api/requests/${requestId}/mark-test`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || body.success === false) {
        setError(body.error || t("request.markAsTestError"));
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("request.markAsTestError"));
    } finally {
      setMarkingTest(false);
    }
  };

  const showTestPayButton = allowTestPayments && (isTestOrder || showTestFallback);

  return (
    <div className="space-y-5">
      <PageHeader title={t("finance.paymentPage.title")} backHref={`/requests/${requestId}`} />

      <Card padding="lg" className="shadow-card">
        {isTestOrder ? (
          <div
            className="mb-4 rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-amber-950"
            role="status"
            data-testid="test-payment-banner"
          >
            <p className="text-base font-extrabold tracking-wide">
              {t("finance.paymentPage.testPaymentTitle")}
            </p>
            <p className="mt-1 text-sm font-medium">
              {t("finance.paymentPage.testPaymentNoMoney")}
            </p>
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {t("finance.paymentPage.orderLabel")}
              {isTestOrder ? (
                <span className="ml-2 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {t("request.testBadge")}
                </span>
              ) : null}
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

            {error && !isStripeConfigUserError(error) ? (
              <p className="mb-3 rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
            ) : null}

            {!isTestOrder && livePayUnavailable ? (
              <div
                className="mb-4 rounded-xl border border-border-subtle bg-surface-muted px-4 py-3"
                role="status"
                data-testid="online-pay-unavailable"
              >
                <p className="text-sm font-semibold text-text-primary">
                  {t("finance.paymentPage.onlinePayUnavailableTitle")}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">
                  {t("finance.paymentPage.onlinePayUnavailableBody")}
                </p>
              </div>
            ) : null}

            {isTestOrder ? (
              <div className="space-y-2">
                <Button
                  variant="secondary"
                  className="w-full gap-2 border-2 border-amber-500"
                  size="lg"
                  loading={testPaying}
                  disabled={paying || markingTest}
                  onClick={() => void handleTestPay()}
                  data-testid="complete-test-payment"
                >
                  <ShieldCheck className="h-5 w-5" />
                  {t("finance.paymentPage.completeTestPayment")}
                </Button>
                <p className="text-center text-xs font-medium text-amber-900">
                  {t("finance.paymentPage.testPaymentNoMoney")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {canMarkAsTest ? (
                  <div className="space-y-2 rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-3">
                    <p className="text-sm font-semibold text-amber-950">
                      {t("request.markAsTestHint")}
                    </p>
                    <Button
                      variant="secondary"
                      className="w-full gap-2 border-2 border-amber-500"
                      size="lg"
                      loading={markingTest}
                      disabled={paying || testPaying}
                      onClick={() => void handleMarkAsTest()}
                      data-testid="mark-order-as-test"
                    >
                      <ShieldCheck className="h-5 w-5" />
                      {t("request.markAsTest")}
                    </Button>
                  </div>
                ) : null}
                <Button
                  className="w-full gap-2"
                  size="lg"
                  loading={paying}
                  disabled={testPaying || markingTest || livePayUnavailable}
                  onClick={() => void handlePayClick()}
                  data-testid="pay-now"
                >
                  <CreditCard className="h-5 w-5" />
                  {t("finance.paymentPage.payNow", { amount: formatPrice(split.gross, currency) })}
                </Button>
              </div>
            )}

            {!isTestOrder && showTestPayButton ? (
              <div className="mt-3 space-y-2">
                <Button
                  variant="secondary"
                  className="w-full gap-2"
                  size="lg"
                  loading={testPaying}
                  disabled={paying}
                  onClick={() => void handleTestPay()}
                >
                  <ShieldCheck className="h-5 w-5" />
                  {t("finance.paymentPage.testPay")}
                </Button>
                <p className="text-xs text-text-muted">{t("finance.paymentPage.testPayHint")}</p>
              </div>
            ) : null}
          </>
        )}
      </Card>
      <ConfirmDialog
        open={showPayUnavailable}
        title={t("finance.paymentPage.onlinePayUnavailableTitle")}
        body={t("finance.paymentPage.onlinePayUnavailableBody")}
        confirmLabel={t("common.gotIt")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => setShowPayUnavailable(false)}
        onCancel={() => setShowPayUnavailable(false)}
      />
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

function isStripeConfigUserError(message: string): boolean {
  return message.toLowerCase().includes("stripe is not configured");
}

function userFacingPaymentError(message: string, fallback: string): string {
  if (isStripeConfigUserError(message)) return fallback;
  return message;
}
