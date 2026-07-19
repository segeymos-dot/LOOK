"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { formatPrice } from "@/lib/utils";
import { CreditCard, Lock, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

export type CheckoutCardInput = {
  cardholderName: string;
  cardNumber: string;
  expiry: string;
  cvc: string;
};

interface OrderPaymentCheckoutProps {
  open: boolean;
  amount: number;
  currency: string;
  onClose: () => void;
  onPay: (input: CheckoutCardInput) => Promise<void>;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function formatCardNumber(value: string): string {
  return digitsOnly(value)
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, "$1 ")
    .trim();
}

function formatExpiry(value: string): string {
  const d = digitsOnly(value).slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

function validateCheckout(input: CheckoutCardInput, t: (key: string) => string): string | null {
  if (input.cardholderName.trim().length < 2) {
    return t("finance.checkout.errorName");
  }
  const num = digitsOnly(input.cardNumber);
  if (num.length < 13 || num.length > 19) {
    return t("finance.checkout.errorCard");
  }
  const exp = digitsOnly(input.expiry);
  if (exp.length !== 4) {
    return t("finance.checkout.errorExpiry");
  }
  const month = Number(exp.slice(0, 2));
  if (month < 1 || month > 12) {
    return t("finance.checkout.errorExpiry");
  }
  if (digitsOnly(input.cvc).length < 3) {
    return t("finance.checkout.errorCvc");
  }
  return null;
}

export function OrderPaymentCheckout({
  open,
  amount,
  currency,
  onClose,
  onPay,
}: OrderPaymentCheckoutProps) {
  const { t } = useTranslation();
  const [cardholderName, setCardholderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!open) {
      setError(null);
      setProcessing(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const input: CheckoutCardInput = { cardholderName, cardNumber, expiry, cvc };
    const validationError = validateCheckout(input, t);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setProcessing(true);
    try {
      await new Promise((r) => setTimeout(r, 1200));
      await onPay(input);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("finance.payment.error"));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        className="w-full max-w-md rounded-2xl bg-surface shadow-elevated"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-brand-600" />
            <h2 id="checkout-title" className="font-semibold text-text-primary">
              {t("finance.checkout.title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="rounded-lg p-1 text-text-muted hover:bg-surface-muted"
            aria-label={t("common.cancel")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="rounded-xl bg-brand-50 px-4 py-3 text-center">
            <p className="text-xs text-text-muted">{t("finance.checkout.amountDue")}</p>
            <p className="text-2xl font-bold text-brand-700">{formatPrice(amount, currency)}</p>
            <p className="mt-1 text-[11px] text-amber-700">{t("finance.checkout.testModeNote")}</p>
          </div>

          <Input
            id="checkout-name"
            label={t("finance.checkout.cardholder")}
            placeholder={t("finance.checkout.cardholderPlaceholder")}
            value={cardholderName}
            onChange={(e) => setCardholderName(e.target.value)}
            autoComplete="cc-name"
            disabled={processing}
          />

          <Input
            id="checkout-number"
            label={t("finance.checkout.cardNumber")}
            placeholder="4242 4242 4242 4242"
            value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
            inputMode="numeric"
            autoComplete="cc-number"
            disabled={processing}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              id="checkout-expiry"
              label={t("finance.checkout.expiry")}
              placeholder="MM/YY"
              value={expiry}
              onChange={(e) => setExpiry(formatExpiry(e.target.value))}
              inputMode="numeric"
              autoComplete="cc-exp"
              disabled={processing}
            />
            <Input
              id="checkout-cvc"
              label={t("finance.checkout.cvc")}
              placeholder="123"
              value={cvc}
              onChange={(e) => setCvc(digitsOnly(e.target.value).slice(0, 4))}
              inputMode="numeric"
              autoComplete="cc-csc"
              disabled={processing}
            />
          </div>

          <p className="text-xs text-text-muted">{t("finance.checkout.testCardHint")}</p>

          {error && (
            <p className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full gap-2" loading={processing}>
            <Lock className="h-4 w-4" />
            {processing
              ? t("finance.payment.processing")
              : t("finance.payment.payOrder", { amount: formatPrice(amount, currency) })}
          </Button>
        </form>
      </div>
    </div>
  );
}
