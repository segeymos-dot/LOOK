/**
 * Server-only gate for simulated / test payment & payout paths.
 * Never read this from the browser via NEXT_PUBLIC_*.
 *
 * Production is always closed for ENABLE_TEST_PAYMENTS — even if mistakenly "true".
 *
 * =============================================================================
 * CANONICAL PROD-SAFE TEST MODE (single source of truth)
 * =============================================================================
 * An order may use the zero-money LOOK test simulator ONLY when ALL hold:
 *   1. ENABLE_PROD_TEST_PAYMENTS === "true"
 *   2. authenticated customer email ∈ PROD_TEST_PAYMENT_EMAILS (or @test.look)
 *   3. request.is_test === true   (DB flag — never title/description text)
 *   4. payment path = simulate_prod_safe_test_payment (look_test)
 *   5. resulting payments.is_test === true
 *   6. no Stripe Checkout / live charge / Connect payout
 *
 * Hard splits (no automatic fallback either direction):
 *   is_test=true  → ONLY prod-safe simulator (never Stripe)
 *   is_test=false → ONLY normal Stripe path (never simulator on production)
 * =============================================================================
 */

export function isProductionRuntime(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  const vercelEnv = env.VERCEL_ENV?.trim();
  if (vercelEnv) {
    return vercelEnv === "production";
  }
  return env.NODE_ENV === "production";
}

export function areTestPaymentsEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  if (isProductionRuntime(env)) return false;
  return env.ENABLE_TEST_PAYMENTS?.trim() === "true";
}

/** Kill-switch for production E2E test payments (is_test orders only). */
export function areProdSafeTestPaymentsEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  return env.ENABLE_PROD_TEST_PAYMENTS?.trim() === "true";
}

export function getProdTestPaymentEmails(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): string[] {
  const configured = [
    env.PROD_TEST_PAYMENT_EMAILS,
    env.NEXT_PUBLIC_TEST_CUSTOMER_EMAIL,
    env.NEXT_PUBLIC_TEST_PROVIDER_EMAIL,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(configured)];
}

/** Emails allowed to create/mark is_test orders and run prod-safe test pay. */
export function isProdTestPaymentEmail(
  email: string | null | undefined,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.endsWith("@test.look")) return true;
  return getProdTestPaymentEmails(env).includes(normalized);
}

export function isTestPaymentActor(
  input: {
    email?: string | null;
    isPlatformAdmin?: boolean;
  },
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  if (input.isPlatformAdmin) return true;
  const email = input.email?.trim().toLowerCase();
  if (!email) return false;
  if (email.endsWith("@test.look")) return true;

  const configured = [
    env.NEXT_PUBLIC_TEST_CUSTOMER_EMAIL,
    env.NEXT_PUBLIC_TEST_PROVIDER_EMAIL,
    env.NEXT_PUBLIC_TEST_ADMIN_EMAIL,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim().toLowerCase());

  return configured.includes(email);
}

export function canInvokeSimulatedOrderPayment(
  input: {
    email?: string | null;
    isPlatformAdmin?: boolean;
    isOrderOwner: boolean;
  },
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  if (!areTestPaymentsEnabled(env)) return false;
  if (input.isOrderOwner) return true;
  return isTestPaymentActor(
    { email: input.email, isPlatformAdmin: input.isPlatformAdmin },
    env
  );
}

/**
 * Production-safe test payment: ENABLE_PROD_TEST_PAYMENTS + is_test order +
 * order owner + allowlisted email. Never opens Stripe.
 */
export function canInvokeProdSafeTestPayment(
  input: {
    email?: string | null;
    isOrderOwner: boolean;
    isTestOrder: boolean;
  },
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  if (!areProdSafeTestPaymentsEnabled(env)) return false;
  if (!input.isTestOrder) return false;
  if (!input.isOrderOwner) return false;
  return isProdTestPaymentEmail(input.email, env);
}

/** Who may mark a new/open order as is_test. */
export function canMarkOrderAsTest(
  input: {
    email?: string | null;
    isPlatformAdmin?: boolean;
  },
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  if (!areProdSafeTestPaymentsEnabled(env) && !areTestPaymentsEnabled(env)) {
    return false;
  }
  if (input.isPlatformAdmin) return true;
  return isProdTestPaymentEmail(input.email, env) || isTestPaymentActor(input, env);
}

export const TEST_PAYMENTS_DISABLED_MESSAGE =
  "Test payments are disabled. Real charges require Stripe Checkout.";

export const TEST_PAYMENTS_ACTOR_DENIED_MESSAGE =
  "Test payments are only available for local test accounts and platform admins.";

export const PROD_SAFE_TEST_DENIED_MESSAGE =
  "Production test payment is only available for marked TEST orders owned by an allowlisted test account.";

export function testPaymentsDisabledJson() {
  return {
    success: false as const,
    error: TEST_PAYMENTS_DISABLED_MESSAGE,
  };
}

export function testPaymentsActorDeniedJson() {
  return {
    success: false as const,
    error: TEST_PAYMENTS_ACTOR_DENIED_MESSAGE,
  };
}

export function prodSafeTestDeniedJson() {
  return {
    success: false as const,
    error: PROD_SAFE_TEST_DENIED_MESSAGE,
  };
}
