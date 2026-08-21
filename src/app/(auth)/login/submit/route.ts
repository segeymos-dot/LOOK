import { handlePasswordFormSignIn } from "@/lib/auth/password-form-sign-in";

/**
 * Classic login form target (not under /api) for Safari/iOS Save Password.
 * POST /login/submit → 303 /login/done → 200 HTML → client navigate home.
 */
export async function POST(request: Request) {
  return handlePasswordFormSignIn(request);
}
