import { handlePasswordFormSignIn } from "@/lib/auth/password-form-sign-in";

/** Classic login form target for Safari/iOS Save Password. */
export async function POST(request: Request) {
  return handlePasswordFormSignIn(request);
}
