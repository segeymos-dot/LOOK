import Stripe from "stripe";
import { PAYMENT_PROVIDER } from "@/lib/payments/constants";

let stripeClient: Stripe | undefined;

/** Currencies with zero decimal places in Stripe. */
const ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

export function getStripeSecretKey(): string | undefined {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key || undefined;
}

export function getStripeWebhookSecret(): string | undefined {
  const key = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  return key || undefined;
}

export function getStripePublishableKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  return key || undefined;
}

/** True when server can create Checkout Sessions / PaymentIntents. */
export function isStripeConfigured(): boolean {
  return Boolean(getStripeSecretKey());
}

export function getStripe(): Stripe {
  const secret = getStripeSecretKey();
  if (!secret) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY in the environment."
    );
  }

  if (stripeClient === undefined) {
    stripeClient = new Stripe(secret, {
      apiVersion: "2026-06-24.dahlia",
      typescript: true,
    });
  }

  return stripeClient;
}

export function toStripeAmount(amount: number, currency: string): number {
  const code = currency.trim().toLowerCase();
  if (ZERO_DECIMAL.has(code)) {
    return Math.round(amount);
  }
  return Math.round(amount * 100);
}

export function fromStripeAmount(amount: number, currency: string): number {
  const code = currency.trim().toLowerCase();
  if (ZERO_DECIMAL.has(code)) {
    return amount;
  }
  return amount / 100;
}

export function stripeProviderName(): typeof PAYMENT_PROVIDER.STRIPE {
  return PAYMENT_PROVIDER.STRIPE;
}

export function missingStripeEnvVars(): string[] {
  const missing: string[] = [];
  if (!getStripeSecretKey()) missing.push("STRIPE_SECRET_KEY");
  if (!getStripePublishableKey()) missing.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  if (!getStripeWebhookSecret()) missing.push("STRIPE_WEBHOOK_SECRET");
  return missing;
}
