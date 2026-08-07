"use client";

import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import { formatPrice } from "@/lib/utils";
import type { PaymentHistoryEntry } from "@/types";
import Link from "next/link";
import { useEffect, useState } from "react";

interface PaymentHistoryListProps {
  /** Nest inside another card (no outer Card chrome). */
  embedded?: boolean;
  /** Limit rows after filter. */
  limit?: number;
  /** Optional role filter (customer payments vs provider earnings). */
  roleFilter?: "customer" | "provider";
  title?: string;
}

export function PaymentHistoryList({
  embedded = false,
  limit,
  roleFilter,
  title,
}: PaymentHistoryListProps) {
  const { t } = useTranslation();
  const [history, setHistory] = useState<PaymentHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void authFetch("/api/finance/payment-history")
      .then((r) => r.json())
      .then((d: { history?: PaymentHistoryEntry[] }) => setHistory(d.history ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = roleFilter
    ? history.filter((e) => e.role === roleFilter)
    : history;
  const rows = typeof limit === "number" ? filtered.slice(0, limit) : filtered;
  const heading = title ?? t("finance.paymentHistory.title");

  const body = loading ? (
    <p className="text-sm text-text-muted">{t("common.loading")}</p>
  ) : rows.length === 0 ? (
    <>
      <h3 className="mb-1 text-sm font-semibold text-text-primary">{heading}</h3>
      <p className="text-sm text-text-muted">{t("finance.paymentHistory.empty")}</p>
    </>
  ) : (
    <>
      <h3 className="mb-3 text-sm font-semibold text-text-primary">{heading}</h3>
      <ul className="space-y-3">
        {rows.map((entry) => (
          <li
            key={entry.id}
            className="rounded-xl border border-border-subtle bg-surface-muted p-3 text-sm"
          >
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/requests/${entry.request_id}`}
                className="font-semibold text-brand-600 hover:underline"
              >
                {entry.request_title}
              </Link>
              <div className="flex flex-col items-end gap-1">
                {!roleFilter && (
                  <span className="text-xs text-text-muted">
                    {t(`finance.paymentHistory.role.${entry.role}`)}
                  </span>
                )}
                <span className="text-xs font-medium text-text-secondary">
                  {t(
                    `finance.paymentStatus.${
                      entry.payment_status === "paid"
                        ? "paid"
                        : entry.payment_status === "refunded"
                          ? "refunded"
                          : entry.payment_status === "failed"
                            ? "failed"
                            : "pending"
                    }`
                  )}
                </span>
              </div>
            </div>
            <p className="font-bold text-text-primary">
              {formatPrice(entry.amount_gross, entry.currency)}
            </p>
            {entry.amount_gross > 0 && (
              <p className="text-xs text-text-secondary">
                {t("finance.payment.splitNote", {
                  rate: `${Math.round((entry.platform_fee / entry.amount_gross) * 100)}%`,
                  fee: formatPrice(entry.platform_fee, entry.currency),
                  amount: formatPrice(entry.provider_amount, entry.currency),
                })}
              </p>
            )}
            {entry.paid_at && (
              <p className="mt-1 text-xs text-text-muted">
                {new Date(entry.paid_at).toLocaleString()}
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );

  if (embedded) {
    return <div className="space-y-1">{body}</div>;
  }

  return <Card padding="md">{body}</Card>;
}
