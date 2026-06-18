import { Card } from "@/components/ui/Card";
import { TRANSACTION_TYPE_LABELS } from "@/lib/config/finance";
import { formatPrice, formatRelativeTime } from "@/lib/utils";
import type { FinanceTransaction } from "@/types";
import { ArrowDownLeft, ArrowUpRight, Minus } from "lucide-react";

interface FinanceTransactionListProps {
  transactions: FinanceTransaction[];
  emptyMessage?: string;
}

function directionIcon(type: FinanceTransaction["type"]) {
  if (type === "provider_earning" || type === "order_payment") {
    return ArrowDownLeft;
  }
  if (type === "provider_payout" || type === "refund") {
    return ArrowUpRight;
  }
  return Minus;
}

export function FinanceTransactionList({
  transactions,
  emptyMessage = "Операций пока нет",
}: FinanceTransactionListProps) {
  if (!transactions.length) {
    return (
      <Card padding="md" className="text-center">
        <p className="text-sm text-text-muted">{emptyMessage}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.map((tx) => {
        const Icon = directionIcon(tx.type);
        return (
          <Card key={tx.id} padding="md" className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-text-secondary">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-text-primary">
                    {TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}
                  </p>
                  <p className="text-sm text-text-secondary">{tx.description}</p>
                </div>
                <p className="shrink-0 text-sm font-bold text-text-primary">
                  {formatPrice(tx.amount, tx.currency)}
                </p>
              </div>
              <p className="mt-1 text-xs text-text-muted">
                {formatRelativeTime(tx.created_at)}
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
