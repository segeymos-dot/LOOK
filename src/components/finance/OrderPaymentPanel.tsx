"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { useOrderPayment } from "@/hooks/useOrderPayment";
import {
  calculatePaymentSplit,
  formatCommissionPercent,
  getPlatformCommissionRate,
} from "@/lib/config/finance";
import { isRequestOwner as checkRequestOwner } from "@/lib/auth/viewer-role";
import { mockCurrentUser } from "@/lib/mock/data";
import { getPaymentUiState } from "@/lib/payments/payment-ui-state";
import { formatPrice } from "@/lib/utils";
import { CreditCard, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OrderFinanceStatusBadge } from "@/components/finance/OrderFinanceStatusBadge";
import type { RefundDisputeStatus, RequestStatus } from "@/types";

interface OrderPaymentPanelProps {
  requestId: string;
  customerId: string;
  providerId: string;
  requestStatus: RequestStatus;
  grossAmount: number;
  currency: string;
  viewerUserId?: string | null;
  viewerIsCustomer?: boolean;
  isDemo?: boolean;
  refundDisputeStatus?: RefundDisputeStatus | null;
  onPaid?: () => void;
  /** Canonical request.is_test. Never infer from Stripe being off. */
  isTestOrder?: boolean;
  /** Server: Stripe secret present. Display-only. */
  liveCheckoutAvailable?: boolean;
}

export function OrderPaymentPanel({
  requestId,
  customerId,
  providerId,
  requestStatus,
  grossAmount,
  currency,
  viewerUserId,
  viewerIsCustomer,
  isDemo = false,
  refundDisputeStatus = "none",
  onPaid,
  isTestOrder: isTestOrderProp,
  liveCheckoutAvailable: liveCheckoutProp,
}: OrderPaymentPanelProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  const activeUserId = user?.id ?? viewerUserId ?? null;
  const isCustomer = checkRequestOwner({
    customerId,
    userId: activeUserId,
    viewerIsOwner: viewerIsCustomer,
    isDemo,
    demoUserId: mockCurrentUser.id,
  });
  const isProvider = activeUserId === providerId;
  const canView = isCustomer || isProvider;

  const showPanel =
    canView &&
    (requestStatus === "in_progress" ||
      requestStatus === "pending_review" ||
      requestStatus === "completed");

  const {
    payment,
    loading,
    isPaid,
    isCompleted,
    orderPaymentStatus,
    isTestOrder: fetchedIsTest,
    liveCheckoutAvailable: fetchedLiveCheckout,
  } = useOrderPayment(requestId, showPanel);

  if (!showPanel) return null;

  const isTestOrder = isTestOrderProp ?? fetchedIsTest;
  const stripeConfigured = liveCheckoutProp ?? fetchedLiveCheckout;
  const uiState = getPaymentUiState({
    isTest: isTestOrder,
    stripeConfigured,
    paymentStatus:
      isCompleted || requestStatus === "completed" ? "completed" : orderPaymentStatus,
  });

  const rate = getPlatformCommissionRate();
  const split = calculatePaymentSplit(grossAmount, rate);
  const paymentPageHref = `/requests/${requestId}/payment`;

  if (uiState === "completed" || (requestStatus === "completed" && isPaid)) {
    return (
      <Card padding="md" className="border-blue-100 bg-blue-50/60 shadow-card">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-blue-900">
                {t("finance.orderPaymentStatus.completed")}
              </h3>
              <OrderFinanceStatusBadge
                orderPaymentStatus="completed"
                refundDisputeStatus={refundDisputeStatus}
              />
            </div>
            {payment && (
              <p className="text-sm text-blue-900">
                {formatPrice(payment.amount_gross, payment.currency)}
              </p>
            )}
            <p className="text-xs text-text-muted">{t("finance.payment.orderCompletedHint")}</p>
          </div>
        </div>
      </Card>
    );
  }

  if (orderPaymentStatus === "payment_pending" && isCustomer) {
    return (
      <Card padding="md" className="border-amber-100 bg-amber-50/50 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-text-primary">{t("finance.payment.title")}</p>
            <p className="text-sm text-text-secondary">{t("finance.payment.checkoutInProgress")}</p>
          </div>
          <OrderFinanceStatusBadge
            orderPaymentStatus="payment_pending"
            refundDisputeStatus={refundDisputeStatus}
          />
        </div>
        <Link href={paymentPageHref} className="mt-3 block">
          <Button className="w-full gap-2" variant="secondary">
            <CreditCard className="h-4 w-4" />
            {t("finance.paymentPage.payNow", { amount: formatPrice(split.gross, currency) })}
          </Button>
        </Link>
      </Card>
    );
  }

  if (uiState === "paid" && payment) {
    return (
      <Card padding="md" className="border-emerald-100 bg-emerald-50/60 shadow-card">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-emerald-900">{t("finance.paymentStatus.paid")}</h3>
              <OrderFinanceStatusBadge
                orderPaymentStatus="paid"
                refundDisputeStatus={refundDisputeStatus}
              />
            </div>
            <p className="text-sm text-emerald-800">
              {formatPrice(payment.amount_gross, payment.currency)} ·{" "}
              {payment.paid_at
                ? new Date(payment.paid_at).toLocaleString()
                : t("finance.payment.paid")}
            </p>
            <p className="text-sm text-text-secondary">
              {t("finance.payment.splitNote", {
                rate: formatCommissionPercent(rate),
                fee: formatPrice(payment.platform_fee, payment.currency),
                amount: formatPrice(payment.provider_amount, payment.currency),
              })}
            </p>
            {payment.external_reference && (
              <p className="text-xs text-text-muted">
                {t("finance.payment.transactionId")}: {payment.external_reference}
              </p>
            )}
            {isProvider && (
              <p className="text-xs text-text-muted">{t("finance.payment.providerPaidHint")}</p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  if (isProvider) {
    return (
      <Card padding="md" className="border-amber-100 bg-amber-50/50 shadow-card">
        <div className="flex items-center gap-3">
          <Wallet className="h-5 w-5 text-amber-600" />
          <div className="flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <p className="font-semibold text-text-primary">{t("finance.payment.awaitingPayment")}</p>
              <OrderFinanceStatusBadge
                orderPaymentStatus="unpaid"
                refundDisputeStatus={refundDisputeStatus}
              />
            </div>
            <p className="text-sm text-text-secondary">
              {t("finance.payment.providerWaiting", {
                amount: formatPrice(split.gross, currency),
              })}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (!isCustomer || requestStatus !== "in_progress") return null;

  if (uiState === "unavailable") {
    return (
      <Card padding="md" className="border-border-subtle bg-surface-muted/60 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-text-muted" />
          <h3 className="font-semibold text-text-primary">{t("finance.payment.title")}</h3>
        </div>
        <div
          className="mb-4 rounded-xl border border-border-subtle bg-surface px-4 py-3"
          role="status"
          data-testid="online-pay-unavailable"
        >
          <p className="text-sm font-semibold text-text-primary">
            {t("finance.paymentPage.onlinePayUnavailableTitle")}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {t("finance.paymentPage.onlinePayUnavailableBody")}
          </p>
        </div>
        <Button className="w-full gap-2" disabled data-testid="pay-now">
          <CreditCard className="h-4 w-4" />
          {t("finance.payment.payOrder", { amount: formatPrice(split.gross, currency) })}
        </Button>
      </Card>
    );
  }

  if (uiState === "test") {
    return (
      <Card padding="md" className="border-amber-200 bg-amber-50/70 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-amber-700" />
          <h3 className="font-semibold text-amber-950">
            {t("finance.paymentPage.testPaymentTitle")}
          </h3>
        </div>
        <p className="mb-3 text-sm text-amber-900">
          {t("finance.paymentPage.testPaymentNoMoney")}
        </p>
        <p className="mb-4 text-sm text-text-secondary">
          {t("finance.payment.checkoutTestDesc", { rate: formatCommissionPercent(rate) })}
        </p>
        <Link href={paymentPageHref}>
          <Button
            className="w-full gap-2 border-2 border-amber-500"
            variant="secondary"
            loading={loading}
            data-testid="complete-test-payment"
          >
            <CreditCard className="h-4 w-4" />
            {t("finance.paymentPage.completeTestPayment")}
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card padding="md" className="border-brand-100 bg-gradient-to-br from-brand-50/80 to-surface shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-brand-600" />
        <h3 className="font-semibold text-text-primary">{t("finance.payment.title")}</h3>
      </div>

      <p className="mb-3 text-sm text-text-secondary">
        {t("finance.payment.checkoutDesc", { rate: formatCommissionPercent(rate) })}
      </p>

      <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
        <SplitCell label={t("finance.payment.customerLabel")} value={formatPrice(split.gross, currency)} />
        <SplitCell
          label={t("finance.payment.platformLabel")}
          value={formatPrice(split.platformFee, currency)}
          className="text-brand-600"
        />
        <SplitCell
          label={t("finance.payment.providerLabel")}
          value={formatPrice(split.providerAmount, currency)}
          className="text-emerald-700"
        />
      </div>

      <Link href={paymentPageHref}>
        <Button
          className="w-full gap-2"
          loading={loading}
          onClick={() => {
            onPaid?.();
            router.refresh();
          }}
          data-testid="pay-now"
        >
          <CreditCard className="h-4 w-4" />
          {t("finance.payment.payOrder", { amount: formatPrice(split.gross, currency) })}
        </Button>
      </Link>
    </Card>
  );
}

function SplitCell({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-xl bg-surface p-2 shadow-sm">
      <p className={`font-bold text-text-primary ${className ?? ""}`}>{value}</p>
      <p className="text-text-muted">{label}</p>
    </div>
  );
}
