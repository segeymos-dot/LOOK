"use client";

import { authFetch } from "@/lib/auth/client-fetch";
import { isOrderPaidForWork } from "@/lib/payments/order-payment";
import { isOrderPaymentCompleted } from "@/lib/payments/order-lifecycle";
import type { OrderPaymentStatus, Payment, PaymentSimulationResult } from "@/types";
import { useCallback, useEffect, useState } from "react";

type OrderPaymentApiResponse = {
  payment?: Payment | null;
  order_payment_status?: OrderPaymentStatus;
};

type CheckoutApiResponse = {
  success?: boolean;
  checkout_url?: string;
  session_id?: string;
  payment_intent_id?: string | null;
  error?: string;
  test_fallback?: boolean;
  demo_fallback?: boolean;
  missing_env?: string[];
};

export function useOrderPayment(requestId: string, enabled = true) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [orderPaymentStatus, setOrderPaymentStatus] = useState<OrderPaymentStatus>("unpaid");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setPayment(null);
      setOrderPaymentStatus("unpaid");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch(`/api/finance/payments/${requestId}`);
      if (!res.ok) {
        setPayment(null);
        return;
      }
      const data = (await res.json()) as OrderPaymentApiResponse;
      setPayment(data.payment ?? null);
      if (data.order_payment_status) {
        setOrderPaymentStatus(data.order_payment_status);
      } else if (data.payment?.status === "paid") {
        setOrderPaymentStatus("paid");
      }
    } finally {
      setLoading(false);
    }
  }, [requestId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const beginPayment = useCallback(async (): Promise<boolean> => {
    const res = await authFetch(`/api/finance/payments/${requestId}/begin`, {
      method: "POST",
    });
    if (!res.ok) return false;
    setOrderPaymentStatus("payment_pending");
    return true;
  }, [requestId]);

  const startStripeCheckout = useCallback(async (): Promise<
    | { ok: true; url: string }
    | { ok: false; useTestFallback: boolean; error: string; missingEnv?: string[] }
  > => {
    const res = await authFetch(`/api/finance/payments/${requestId}/checkout`, {
      method: "POST",
    });
    const data = (await res.json()) as CheckoutApiResponse;

    if (res.ok && data.checkout_url) {
      setOrderPaymentStatus("payment_pending");
      return { ok: true, url: data.checkout_url };
    }

    const useTestFallback = Boolean(data.test_fallback || data.demo_fallback || res.status === 503);
    return {
      ok: false,
      useTestFallback,
      error: data.error ?? "Could not start Stripe Checkout",
      missingEnv: data.missing_env,
    };
  }, [requestId]);

  const confirmStripeSession = useCallback(
    async (sessionId: string): Promise<PaymentSimulationResult | null> => {
      const res = await authFetch(`/api/finance/payments/${requestId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = (await res.json()) as PaymentSimulationResult & {
        success?: boolean;
        error?: string;
      };

      if (!res.ok || data.success === false) {
        throw new Error(data.error ?? "Could not confirm Stripe payment");
      }

      const nextPayment: Payment = {
        id: data.payment_id,
        request_id: requestId,
        offer_id: "",
        customer_id: "",
        provider_id: "",
        amount_gross: data.amount_gross,
        platform_fee: data.platform_fee,
        provider_amount: data.provider_amount,
        currency: data.currency,
        status: data.status,
        payment_method: "stripe",
        external_reference: data.external_reference ?? sessionId,
        paid_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      setPayment(nextPayment);
      setOrderPaymentStatus(data.order_payment_status ?? "paid");
      return data;
    },
    [requestId]
  );

  const pay = useCallback(
    async (externalReference?: string): Promise<PaymentSimulationResult | null> => {
      const res = await authFetch(`/api/finance/payments/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          externalReference ? { external_reference: externalReference } : {}
        ),
      });
      const data = (await res.json()) as PaymentSimulationResult & {
        success?: boolean;
        error?: string;
      };

      if (!res.ok || data.success === false) {
        throw new Error(data.error ?? "Payment failed");
      }

      const nextPayment: Payment = {
        id: data.payment_id,
        request_id: requestId,
        offer_id: "",
        customer_id: "",
        provider_id: "",
        amount_gross: data.amount_gross,
        platform_fee: data.platform_fee,
        provider_amount: data.provider_amount,
        currency: data.currency,
        status: data.status,
        payment_method: data.payment_provider === "stripe" ? "stripe" : "test",
        external_reference: data.external_reference ?? externalReference ?? null,
        paid_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      setPayment(nextPayment);
      setOrderPaymentStatus(data.order_payment_status ?? "paid");
      return data;
    },
    [requestId]
  );

  const isPaid =
    payment?.status === "paid" || isOrderPaidForWork(orderPaymentStatus);

  const isCompleted = isOrderPaymentCompleted(orderPaymentStatus);

  return {
    payment,
    orderPaymentStatus,
    loading,
    refresh,
    beginPayment,
    startStripeCheckout,
    confirmStripeSession,
    pay,
    isPaid,
    isCompleted,
  };
}
