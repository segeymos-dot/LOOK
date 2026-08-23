"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { FinanceTransactionList } from "@/components/finance/FinanceTransactionList";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import type { AmountViewer, TransactionViewerScope } from "@/lib/finance/ledger";
import type { FinanceTransaction } from "@/types";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function FinanceTransactionsContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const requestedScope = searchParams.get("scope");
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<AmountViewer>("customer");
  const [scope, setScope] = useState<TransactionViewerScope>("customer");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ limit: "50" });
        if (requestedScope) qs.set("scope", requestedScope);
        const res = await authFetch(`/api/finance/transactions?${qs.toString()}`);
        const data = await res.json();
        if (data.transactions) setTransactions(data.transactions);
        if (data.viewer) setViewer(data.viewer as AmountViewer);
        if (data.scope) setScope(data.scope as TransactionViewerScope);
        else if (data.isAdmin) {
          setViewer("admin");
          setScope("admin");
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [requestedScope]);

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
          <FinanceTransactionList
            transactions={transactions}
            viewer={viewer}
            scope={scope}
          />
        )}
      </div>
    </AppLayout>
  );
}

export default function FinanceTransactionsPage() {
  return (
    <Suspense fallback={null}>
      <FinanceTransactionsContent />
    </Suspense>
  );
}
