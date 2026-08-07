"use client";

/**
 * Own-profile finance summary only. Uses existing balance / payment-history /
 * transactions APIs. Never mount on public `/providers/[id]`.
 */
import { FinanceStatCard } from "@/components/finance/FinanceStatCard";
import { PaymentHistoryList } from "@/components/finance/PaymentHistoryList";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import {
  getTransactionTypeLabelT,
} from "@/lib/i18n/client-messages";
import {
  isLedgerVisibleToScope,
  isMoneyLedgerCode,
  resolveLedgerCode,
  signedAmountForViewer,
} from "@/lib/finance/ledger";
import { formatPrice } from "@/lib/utils";
import type { FinanceTransaction, ProviderBalance } from "@/types";
import {
  ChevronRight,
  Clock,
  History,
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

export function ProfileFinanceBlock({
  showProvider,
  showCustomer,
  adminLinks,
}: ProfileFinanceBlockProps) {
  const { t } = useTranslation();
  const [balance, setBalance] = useState<ProviderBalance | null>(null);
  const [recentTx, setRecentTx] = useState<FinanceTransaction | null>(null);
  const [loadingProvider, setLoadingProvider] = useState(showProvider);

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
        const txs = (txData.transactions ?? []) as FinanceTransaction[];
        const firstVisible = txs.find((tx) => {
          const code = String(resolveLedgerCode(tx.type, tx.ledger_code));
          if (!isLedgerVisibleToScope(code, "provider")) return false;
          if (!isMoneyLedgerCode(code)) return false;
          return (
            signedAmountForViewer(code, tx.amount, tx.amount_signed, "provider") !==
            0
          );
        });
        setRecentTx(firstVisible ?? null);
      } finally {
        if (!cancelled) setLoadingProvider(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showProvider]);

  const currency = balance?.currency ?? "USD";

  let recentLine: string | null = null;
  if (recentTx) {
    const code = String(resolveLedgerCode(recentTx.type, recentTx.ledger_code));
    const signed = signedAmountForViewer(
      code,
      recentTx.amount,
      recentTx.amount_signed,
      "provider"
    );
    const label = getTransactionTypeLabelT(code, t);
    const amount = formatPrice(Math.abs(signed), recentTx.currency || currency);
    recentLine = `${label} ${signed >= 0 ? "+" : "−"}${amount}`;
  }

  return (
    <Card padding="md" className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-text-primary">
          {t("profile.finance.title")}
        </h2>
        <p className="mt-0.5 text-xs text-text-muted">{t("profile.finance.subtitle")}</p>
      </div>

      {showProvider && (
        <section className="space-y-3" aria-label={t("profile.finance.providerSection")}>
          {loadingProvider && !balance ? (
            <p className="text-sm text-text-muted">{t("finance.provider.loadingBalance")}</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FinanceStatCard
                icon={Wallet}
                label={t("finance.provider.availableBalance")}
                value={formatPrice(balance?.available_balance ?? 0, currency)}
                hint={t("finance.provider.availableHint")}
                accent="success"
              />
              <FinanceStatCard
                icon={Clock}
                label={t("finance.provider.pendingPayout")}
                value={formatPrice(balance?.pending_payout ?? 0, currency)}
                accent="warning"
              />
              <FinanceStatCard
                icon={TrendingUp}
                label={t("finance.provider.totalEarned")}
                value={formatPrice(balance?.total_earned ?? 0, currency)}
                accent="brand"
              />
            </div>
          )}

          {recentLine ? (
            <p className="rounded-xl border border-border-subtle bg-surface-muted px-3 py-2 text-sm text-text-secondary">
              <span className="font-medium text-text-primary">
                {t("profile.finance.latestActivity")}
              </span>
              {": "}
              {recentLine}
            </p>
          ) : null}

          <div className="grid gap-2">
            <Link href="/my/balance">
              <Button variant="outline" className="w-full justify-between gap-2" size="sm">
                <span className="inline-flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  {t("profile.finance.balanceAndPayouts")}
                </span>
                <ChevronRight className="h-4 w-4 text-text-muted" />
              </Button>
            </Link>
            <Link href="/finance/transactions">
              <Button variant="outline" className="w-full justify-between gap-2" size="sm">
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
          className={showProvider ? "space-y-3 border-t border-border-subtle pt-4" : "space-y-3"}
          aria-label={t("profile.finance.customerSection")}
        >
          {!showProvider && (
            <div className="grid gap-2">
              <Link href="/finance/transactions">
                <Button variant="outline" className="w-full justify-between gap-2" size="sm">
                  <span className="inline-flex items-center gap-2">
                    <History className="h-4 w-4" />
                    {t("profile.transactions")}
                  </span>
                  <ChevronRight className="h-4 w-4 text-text-muted" />
                </Button>
              </Link>
            </div>
          )}
          <PaymentHistoryList
            embedded
            roleFilter="customer"
            limit={5}
            title={t("profile.finance.paymentHistory")}
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
