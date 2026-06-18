"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { FinanceTransactionList } from "@/components/finance/FinanceTransactionList";
import { PageHeader } from "@/components/ui/PageHeader";
import { authFetch } from "@/lib/auth/client-fetch";
import type { FinanceTransaction } from "@/types";
import { useEffect, useState } from "react";

export default function FinanceTransactionsPage() {
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch("/api/finance/transactions?limit=50");
        const data = await res.json();
        if (data.transactions) setTransactions(data.transactions);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <AppLayout hideNav title="Операции">
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title="История операций"
          subtitle="Оплаты, комиссии, начисления и выплаты"
          backHref="/profile"
        />
        {loading ? (
          <p className="text-sm text-text-muted">Загрузка…</p>
        ) : (
          <FinanceTransactionList transactions={transactions} />
        )}
      </div>
    </AppLayout>
  );
}
