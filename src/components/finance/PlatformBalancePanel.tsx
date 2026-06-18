"use client";

import { FinanceStatCard } from "@/components/finance/FinanceStatCard";
import { authFetch } from "@/lib/auth/client-fetch";
import { formatCommissionPercent } from "@/lib/config/finance";
import { formatPrice } from "@/lib/utils";
import type { PlatformSummary } from "@/types";
import { BadgeDollarSign, Percent, Receipt, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

export function PlatformBalancePanel() {
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch("/api/finance/platform-summary");
        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(data.error ?? "Не удалось загрузить данные");
          return;
        }
        setSummary(data.summary);
      } catch {
        setError("Не удалось загрузить данные");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) return <p className="text-sm text-text-muted">Загрузка…</p>;
  if (error) {
    return (
      <p className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</p>
    );
  }

  const currency = summary?.currency ?? "USD";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">
        Баланс платформы LOOK · тестовый режим · будущая юрисдикция: ОАЭ · Stripe Connect не
        подключён
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FinanceStatCard
          icon={BadgeDollarSign}
          label="Доход платформы (комиссии)"
          value={formatPrice(summary?.total_commission ?? 0, currency)}
          accent="success"
        />
        <FinanceStatCard
          icon={Percent}
          label="Ставка комиссии"
          value={formatCommissionPercent(summary?.commission_rate ?? 0.15)}
        />
        <FinanceStatCard
          icon={Receipt}
          label="Оплаченных заказов"
          value={String(summary?.paid_orders_count ?? 0)}
        />
        <FinanceStatCard
          icon={TrendingUp}
          label="Оборот платформы"
          value={formatPrice(summary?.gross_volume ?? 0, currency)}
          hint="Сумма всех тестовых оплат"
        />
      </div>
    </div>
  );
}
