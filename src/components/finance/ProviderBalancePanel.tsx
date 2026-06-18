"use client";

import { FinanceStatCard } from "@/components/finance/FinanceStatCard";
import { FinanceTransactionList } from "@/components/finance/FinanceTransactionList";
import { Button } from "@/components/ui/Button";
import { authFetch } from "@/lib/auth/client-fetch";
import { formatCommissionPercent } from "@/lib/config/finance";
import { formatPrice } from "@/lib/utils";
import type { FinanceTransaction, ProviderBalance } from "@/types";
import { Banknote, Clock, TrendingUp, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export function ProviderBalancePanel() {
  const [balance, setBalance] = useState<ProviderBalance | null>(null);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [balRes, txRes] = await Promise.all([
        authFetch("/api/finance/provider-balance"),
        authFetch("/api/finance/transactions?limit=10"),
      ]);
      const balData = await balRes.json();
      const txData = await txRes.json();
      if (balData.balance) setBalance(balData.balance);
      if (txData.transactions) setTransactions(txData.transactions);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePayout = async () => {
    setError(null);
    setPayoutLoading(true);
    try {
      const res = await authFetch("/api/finance/provider-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Не удалось создать выплату");
        return;
      }
      await load();
    } catch {
      setError("Не удалось создать выплату");
    } finally {
      setPayoutLoading(false);
    }
  };

  if (loading && !balance) {
    return <p className="text-sm text-text-muted">Загрузка баланса…</p>;
  }

  const currency = balance?.currency ?? "USD";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FinanceStatCard
          icon={Wallet}
          label="Доступный баланс"
          value={formatPrice(balance?.available_balance ?? 0, currency)}
          hint="Можно вывести (тест)"
          accent="success"
        />
        <FinanceStatCard
          icon={Clock}
          label="Ожидают выплаты"
          value={formatPrice(balance?.pending_payout ?? 0, currency)}
          accent="warning"
        />
        <FinanceStatCard
          icon={TrendingUp}
          label="Всего заработано"
          value={formatPrice(balance?.total_earned ?? 0, currency)}
          accent="brand"
        />
      </div>

      {(balance?.available_balance ?? 0) > 0 && (
        <div className="space-y-2">
          {error && (
            <p className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
          )}
          <Button
            variant="outline"
            className="w-full gap-2"
            loading={payoutLoading}
            onClick={handlePayout}
          >
            <Banknote className="h-4 w-4" />
            Запросить тестовую выплату
          </Button>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold text-text-primary">Последние операции</h2>
        <FinanceTransactionList transactions={transactions.slice(0, 5)} />
      </section>

      <p className="text-xs text-text-muted">
        Комиссия LOOK: {formatCommissionPercent()}. Режим тестирования — без Stripe Connect.
      </p>
    </div>
  );
}
