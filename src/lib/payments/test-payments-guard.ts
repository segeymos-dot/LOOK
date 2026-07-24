/**
 * Server-only gate for simulated / test payment & payout paths.
 * Never read this from the browser via NEXT_PUBLIC_*.
 */
export function areTestPaymentsEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  return env.ENABLE_TEST_PAYMENTS === "true";
}

export const TEST_PAYMENTS_DISABLED_MESSAGE =
  "Test payments are disabled. Real charges require Stripe Checkout.";

export function testPaymentsDisabledJson() {
  return {
    success: false as const,
    error: TEST_PAYMENTS_DISABLED_MESSAGE,
  };
}
