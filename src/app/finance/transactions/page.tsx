"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { FinanceTransactionList } from "@/components/finance/FinanceTransactionList";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import type { FinanceTransaction } from "@/types";
import { useEffect, useState } from "react";

export default function FinanceTransactionsPage() {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<"customer" | "provider" | "platform" | "admin">(
    "customer"
  );

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch("/api/finance/transactions?limit=50");
        const data = await res.json();
        if (data.transactions) setTransactions(data.transactions);
        if (data.isAdmin) setViewer("admin");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <AppLayout hideNav title={t("finance.transactions.title")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("finance.transactions.title")}
          subtitle={t("finance.transactions.subtitle")}
          backHref="/profile"
        />
        {loading ? (
          <p className="text-sm text-text-muted">{t("common.loading")}</p>
        ) : (
          <FinanceTransactionList transactions={transactions} viewer={viewer} />
        )}
      </div>
    </AppLayout>
  );
}
