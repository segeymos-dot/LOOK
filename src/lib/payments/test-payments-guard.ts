/**
 * Server-only gate for simulated / test payment & payout paths.
 * Never read this from the browser via NEXT_PUBLIC_*.
 *
 * Production is always closed — even if ENABLE_TEST_PAYMENTS is mistakenly "true".
 *
 * On Vercel, trust VERCEL_ENV only: Preview builds use NODE_ENV=production but
 * VERCEL_ENV=preview, so test payments can open there without opening Production.
 * Off Vercel, NODE_ENV=production (e.g. `next start`) stays closed.
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
  // Trim: Vercel UI pastes sometimes include trailing whitespace/newlines.
  return env.ENABLE_TEST_PAYMENTS?.trim() === "true";
}

/**
 * Who may invoke the simulated payment path when the env gate is open:
 * platform admins and known local test accounts (@test.look / configured test emails).
 */
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

export const TEST_PAYMENTS_DISABLED_MESSAGE =
  "Test payments are disabled. Real charges require Stripe Checkout.";

export const TEST_PAYMENTS_ACTOR_DENIED_MESSAGE =
  "Test payments are only available for local test accounts and platform admins.";

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
