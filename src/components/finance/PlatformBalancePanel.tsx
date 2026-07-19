"use client";

import { FinanceStatCard } from "@/components/finance/FinanceStatCard";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import { formatCommissionPercent, getPlatformCommissionRate } from "@/lib/config/finance";
import { formatPrice } from "@/lib/utils";
import type { PlatformSummary } from "@/types";
import { BadgeDollarSign, Percent, Receipt, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

export function PlatformBalancePanel() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch("/api/finance/platform-summary");
        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(data.error ?? t("finance.platform.loadError"));
          return;
        }
        setSummary(data.summary);
      } catch {
        setError(t("finance.platform.loadError"));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [t]);

  if (loading) return <p className="text-sm text-text-muted">{t("common.loading")}</p>;
  if (error) {
    return (
      <p className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</p>
    );
  }

  const currency = summary?.currency ?? "USD";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">
        {t("finance.platform.banner")}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FinanceStatCard
          icon={BadgeDollarSign}
          label={t("finance.platform.platformRevenue")}
          value={formatPrice(summary?.total_commission ?? 0, currency)}
          accent="success"
        />
        <FinanceStatCard
          icon={Percent}
          label={t("finance.platform.commissionRate")}
          value={formatCommissionPercent(summary?.commission_rate ?? getPlatformCommissionRate())}
        />
        <FinanceStatCard
          icon={Receipt}
          label={t("finance.platform.paidOrders")}
          value={String(summary?.paid_orders_count ?? 0)}
        />
        <FinanceStatCard
          icon={TrendingUp}
          label={t("finance.platform.grossVolume")}
          value={formatPrice(summary?.gross_volume ?? 0, currency)}
          hint={t("finance.platform.grossVolumeHint")}
        />
      </div>
    </div>
  );
}
