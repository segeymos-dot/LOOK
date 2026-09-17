"use client";

import { AddPaymentMethodButton } from "@/components/payments/AddPaymentMethodButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import type { SavedPaymentMethodUi } from "@/lib/payments/billing-ui-state";
import { CreditCard } from "lucide-react";

/**
 * Customer payment methods surface.
 * Ready for future Stripe PaymentMethods — do not seed fake cards in production.
 */
export function PaymentMethodsCard({
  methods = [],
}: {
  methods?: SavedPaymentMethodUi[];
}) {
  const { t } = useTranslation();
  const empty = methods.length === 0;

  return (
    <Card padding="lg" className="space-y-4" data-testid="payment-methods-card">
      <div>
        <h2 className="text-base font-bold uppercase tracking-wide text-text-primary">
          {t("paymentsPayouts.paymentMethodsTitle")}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">
          {t("paymentsPayouts.paymentMethodsDesc")}
        </p>
      </div>

      {empty ? (
        <div
          className="rounded-2xl border border-dashed border-border-subtle bg-surface-muted px-4 py-6 text-center"
          data-testid="payment-methods-empty"
        >
          <CreditCard className="mx-auto h-8 w-8 text-text-muted" aria-hidden />
          <p className="mt-3 text-sm font-medium text-text-primary">
            {t("paymentsPayouts.paymentMethodsEmpty")}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {methods.map((method) => (
            <li
              key={method.id}
              className="rounded-2xl border border-border-subtle bg-surface px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-text-primary">
                    {method.brandLabel} •••• {method.last4}
                  </p>
                  {method.status === "default" ? (
                    <p className="text-xs font-medium text-brand-700">
                      {t("paymentsPayouts.defaultCard")}
                    </p>
                  ) : null}
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  {method.status !== "default" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      disabled
                    >
                      {t("paymentsPayouts.makeDefault")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto text-danger"
                    disabled
                  >
                    {t("paymentsPayouts.removeCard")}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddPaymentMethodButton />
    </Card>
  );
}
