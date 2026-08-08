"use client";

/**
 * Own-profile finance summary only. Uses existing balance / payment-history /
 * transactions / order-history APIs. Never mount on public `/providers/[id]`.
 */
import { FinanceStatCard } from "@/components/finance/FinanceStatCard";
import { PaymentHistoryList } from "@/components/finance/PaymentHistoryList";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import { getTransactionTypeLabelT } from "@/lib/i18n/client-messages";
import {
  isLedgerVisibleToScope,
  isMoneyLedgerCode,
  resolveLedgerCode,
  signedAmountForViewer,
  type AmountViewer,
} from "@/lib/finance/ledger";
import type { OrderHistoryItem } from "@/lib/orders/history-types";
import { formatPrice } from "@/lib/utils";
import type {
  FinanceTransaction,
  PaymentHistoryEntry,
  ProviderBalance,
} from "@/types";
import {
  Briefcase,
  ChevronRight,
  Clock,
  CreditCard,
  History,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

interface ProfileFinanceBlockProps {
  showProvider: boolean;
  showCustomer: boolean;
  /** Admin shortcuts kept separate from personal finance. */
  adminLinks?: ReactNode;
}

function pickLatestVisibleTx(
  txs: FinanceTransaction[],
  viewer: AmountViewer
): FinanceTransaction | null {
  return (
    txs.find((tx) => {
      const code = String(resolveLedgerCode(tx.type, tx.ledger_code));
      if (!isLedgerVisibleToScope(code, viewer === "party" ? "party" : viewer)) {
        return false;
      }
      if (!isMoneyLedgerCode(code)) return false;
      return signedAmountForViewer(code, tx.amount, tx.amount_signed, viewer) !== 0;
    }) ?? null
  );
}

function formatTxLine(
  tx: FinanceTransaction,
  viewer: AmountViewer,
  fallbackCurrency: string,
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  const code = String(resolveLedgerCode(tx.type, tx.ledger_code));
  const signed = signedAmountForViewer(
    code,
    tx.amount,
    tx.amount_signed,
    viewer
  );
  const label = getTransactionTypeLabelT(code, t);
  const amount = formatPrice(Math.abs(signed), tx.currency || fallbackCurrency);
  return `${label} ${signed >= 0 ? "+" : "−"}${amount}`;
}

export function ProfileFinanceBlock({
  showProvider,
  showCustomer,
  adminLinks,
}: ProfileFinanceBlockProps) {
  const { t } = useTranslation();
  const [balance, setBalance] = useState<ProviderBalance | null>(null);
  const [providerRecentTx, setProviderRecentTx] =
    useState<FinanceTransaction | null>(null);
  const [loadingProvider, setLoadingProvider] = useState(showProvider);

  const [customerPayments, setCustomerPayments] = useState<PaymentHistoryEntry[]>(
    []
  );
  const [customerRecentTx, setCustomerRecentTx] =
    useState<FinanceTransaction | null>(null);
  const [activeOrdersCount, setActiveOrdersCount] = useState(0);
  const [loadingCustomer, setLoadingCustomer] = useState(showCustomer);

  useEffect(() => {
    if (!showProvider) return;
    let cancelled = false;
    setLoadingProvider(true);
    void (async () => {
      try {
        const [balRes, txRes] = await Promise.all([
          authFetch("/api/finance/provider-balance"),
          authFetch("/api/finance/transactions?limit=10&scope=provider"),
        ]);
        const balData = await balRes.json();
        const txData = await txRes.json();
        if (cancelled) return;
        if (balData.balance) setBalance(balData.balance);
        setProviderRecentTx(
          pickLatestVisibleTx(
            (txData.transactions ?? []) as FinanceTransaction[],
            "provider"
          )
        );
      } finally {
        if (!cancelled) setLoadingProvider(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showProvider]);

  useEffect(() => {
    if (!showCustomer) return;
    let cancelled = false;
    setLoadingCustomer(true);
    void (async () => {
      try {
        const [payRes, txRes, ordersRes] = await Promise.all([
          authFetch("/api/finance/payment-history"),
          authFetch("/api/finance/transactions?limit=10&scope=customer"),
          authFetch(
            "/api/orders/history?viewer=customer&tab=active&page=1&pageSize=50"
          ),
        ]);
        const payData = await payRes.json();
        const txData = await txRes.json();
        const ordersData = await ordersRes.json();
        if (cancelled) return;

        const history = (payData.history ?? []) as PaymentHistoryEntry[];
        setCustomerPayments(history.filter((e) => e.role === "customer"));
        setCustomerRecentTx(
          pickLatestVisibleTx(
            (txData.transactions ?? []) as FinanceTransaction[],
            "customer"
          )
        );

        const items = (ordersData.items ?? []) as OrderHistoryItem[];
        // Active tab already scopes to in-progress work; keep a safe filter.
        setActiveOrdersCount(
          items.filter(
            (item) =>
              item.status === "in_progress" || item.status === "pending_review"
          ).length
        );
      } finally {
        if (!cancelled) setLoadingCustomer(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showCustomer]);

  const providerCurrency = balance?.currency ?? "USD";
  const paidCustomer = customerPayments.filter((e) => e.payment_status === "paid");
  const totalPaid = paidCustomer.reduce(
    (sum, e) => sum + (Number(e.amount_gross) || 0),
    0
  );
  const paidOrdersCount = paidCustomer.length;
  const customerCurrency = paidCustomer[0]?.currency ?? "USD";

  const providerRecentLine = providerRecentTx
    ? formatTxLine(providerRecentTx, "provider", providerCurrency, t)
    : null;

  let customerRecentLine: string | null = null;
  if (customerRecentTx) {
    customerRecentLine = formatTxLine(
      customerRecentTx,
      "customer",
      customerCurrency,
      t
    );
  } else if (paidCustomer[0]) {
    const latest = paidCustomer[0];
    customerRecentLine = `${t("finance.paymentStatus.paid")} ${formatPrice(
      latest.amount_gross,
      latest.currency
    )} · ${latest.request_title}`;
  }

  return (
    <Card padding="md" className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-text-primary">
          {t("profile.finance.title")}
        </h2>
        <p className="mt-0.5 text-xs text-text-muted">
          {t("profile.finance.subtitle")}
        </p>
      </div>

      {showProvider && (
        <section
          className="space-y-3"
          aria-label={t("profile.finance.providerSection")}
        >
          {loadingProvider && !balance ? (
            <p className="text-sm text-text-muted">
              {t("finance.provider.loadingBalance")}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FinanceStatCard
                icon={Wallet}
                label={t("finance.provider.availableBalance")}
                value={formatPrice(
                  balance?.available_balance ?? 0,
                  providerCurrency
                )}
                hint={t("finance.provider.availableHint")}
                accent="success"
              />
              <FinanceStatCard
                icon={Clock}
                label={t("finance.provider.pendingPayout")}
                value={formatPrice(
                  balance?.pending_payout ?? 0,
                  providerCurrency
                )}
                accent="warning"
              />
              <FinanceStatCard
                icon={TrendingUp}
                label={t("finance.provider.totalEarned")}
                value={formatPrice(balance?.total_earned ?? 0, providerCurrency)}
                accent="brand"
              />
            </div>
          )}

          {providerRecentLine ? (
            <p className="rounded-xl border border-border-subtle bg-surface-muted px-3 py-2 text-sm text-text-secondary">
              <span className="font-medium text-text-primary">
                {t("profile.finance.latestActivity")}
              </span>
              {": "}
              {providerRecentLine}
            </p>
          ) : null}

          <div className="grid gap-2">
            <Link href="/my/balance">
              <Button
                variant="outline"
                className="w-full justify-between gap-2"
                size="sm"
              >
                <span className="inline-flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  {t("profile.finance.balanceAndPayouts")}
                </span>
                <ChevronRight className="h-4 w-4 text-text-muted" />
              </Button>
            </Link>
            <Link href="/finance/transactions">
              <Button
                variant="outline"
                className="w-full justify-between gap-2"
                size="sm"
              >
                <span className="inline-flex items-center gap-2">
                  <History className="h-4 w-4" />
                  {t("profile.transactions")}
                </span>
                <ChevronRight className="h-4 w-4 text-text-muted" />
              </Button>
            </Link>
          </div>
        </section>
      )}

      {showCustomer && (
        <section
          className={
            showProvider
              ? "space-y-3 border-t border-border-subtle pt-4"
              : "space-y-3"
          }
          aria-label={t("profile.finance.customerSection")}
        >
          {showProvider ? (
            <h3 className="text-sm font-semibold text-text-primary">
              {t("profile.finance.customerSection")}
            </h3>
          ) : null}

          {loadingCustomer && customerPayments.length === 0 ? (
            <p className="text-sm text-text-muted">{t("common.loading")}</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FinanceStatCard
                icon={CreditCard}
                label={t("profile.finance.totalPaid")}
                value={formatPrice(totalPaid, customerCurrency)}
                hint={t("profile.finance.totalPaidHint")}
                accent="success"
              />
              <FinanceStatCard
                icon={Receipt}
                label={t("profile.finance.paidOrders")}
                value={String(paidOrdersCount)}
                hint={t("profile.finance.paidOrdersHint")}
                accent="brand"
              />
              <FinanceStatCard
                icon={Briefcase}
                label={t("profile.finance.activeOrders")}
                value={String(activeOrdersCount)}
                hint={t("profile.finance.activeOrdersHint")}
                accent="warning"
              />
            </div>
          )}

          {customerRecentLine ? (
            <p className="rounded-xl border border-border-subtle bg-surface-muted px-3 py-2 text-sm text-text-secondary">
              <span className="font-medium text-text-primary">
                {t("profile.finance.latestActivity")}
              </span>
              {": "}
              {customerRecentLine}
            </p>
          ) : null}

          <div className="grid gap-2">
            <Link href="/finance/transactions">
              <Button
                variant="outline"
                className="w-full justify-between gap-2"
                size="sm"
              >
                <span className="inline-flex items-center gap-2">
                  <History className="h-4 w-4" />
                  {t("profile.transactions")}
                </span>
                <ChevronRight className="h-4 w-4 text-text-muted" />
              </Button>
            </Link>
            <Link href="/my/orders">
              <Button
                variant="outline"
                className="w-full justify-between gap-2"
                size="sm"
              >
                <span className="inline-flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  {t("profile.orderHistory")}
                </span>
                <ChevronRight className="h-4 w-4 text-text-muted" />
              </Button>
            </Link>
          </div>

          <PaymentHistoryList
            embedded
            roleFilter="customer"
            limit={5}
            title={t("profile.finance.paymentHistory")}
            entries={customerPayments}
          />
        </section>
      )}

      {adminLinks ? (
        <div className="space-y-2 border-t border-border-subtle pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {t("profile.finance.adminSection")}
          </p>
          <div className="grid gap-2">{adminLinks}</div>
        </div>
      ) : null}
    </Card>
  );
}
