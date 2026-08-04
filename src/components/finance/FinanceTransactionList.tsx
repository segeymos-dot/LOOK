"use client";

import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import {
  formatRelativeTimeT,
  getTransactionTypeLabelT,
} from "@/lib/i18n/client-messages";
import {
  isMoneyLedgerCode,
  resolveLedgerCode,
  signedAmountForViewer,
} from "@/lib/finance/ledger";
import { formatPrice } from "@/lib/utils";
import type { FinanceTransaction } from "@/types";
import { ArrowDownLeft, ArrowUpRight, Minus } from "lucide-react";

interface FinanceTransactionListProps {
  transactions: FinanceTransaction[];
  emptyMessage?: string;
  /** Controls sign presentation for the same ledger event. */
  viewer?: "customer" | "provider" | "platform" | "admin";
}

function directionIcon(code: string, signed: number) {
  if (!isMoneyLedgerCode(code) || signed === 0) return Minus;
  return signed > 0 ? ArrowDownLeft : ArrowUpRight;
}

export function FinanceTransactionList({
  transactions,
  emptyMessage,
  viewer = "admin",
}: FinanceTransactionListProps) {
  const { t, locale } = useTranslation();
  const empty = emptyMessage ?? t("finance.transactions.empty");

  if (!transactions.length) {
    return (
      <Card padding="md" className="text-center">
        <p className="text-sm text-text-muted">{empty}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.map((tx) => {
        const code = String(resolveLedgerCode(tx.type, tx.ledger_code));
        const signed = signedAmountForViewer(
          code,
          tx.amount,
          tx.amount_signed,
          viewer
        );
        const Icon = directionIcon(code, signed);
        const reason =
          typeof tx.metadata?.reason === "string" &&
          !/^[a-z0-9_]+$/i.test(tx.metadata.reason)
            ? tx.metadata.reason
            : null;

        return (
          <Card key={tx.id} padding="md" className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-text-secondary">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-text-primary">
                    {getTransactionTypeLabelT(tx.type, t, tx.ledger_code)}
                  </p>
                  {reason ? (
                    <p className="text-sm text-text-secondary whitespace-pre-wrap">{reason}</p>
                  ) : null}
                </div>
                <p className="shrink-0 text-sm font-bold text-text-primary">
                  {isMoneyLedgerCode(code)
                    ? `${signed > 0 ? "+" : signed < 0 ? "−" : ""}${formatPrice(Math.abs(signed || tx.amount), tx.currency)}`
                    : "—"}
                </p>
              </div>
              <p className="mt-1 text-xs text-text-muted">
                {formatRelativeTimeT(tx.created_at, t, locale === "en" ? "en-US" : "ru-RU")}
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
