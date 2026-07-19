import {
  DEV_EMAIL_CONFIRM_HINT,
  SUPABASE_REDIRECT_URLS_HINT,
} from "@/lib/auth/email-confirmation";
import { PRODUCTION_SIGNUP_EMAIL_REDIRECT, getAuthEmailRedirectTo } from "@/lib/app-url";
import { isDemoMode } from "@/lib/config";
import { NextResponse } from "next/server";

export async function GET() {
  if (isDemoMode()) {
    return NextResponse.json({
      demo: true,
      requiresEmailConfirmation: false,
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ requiresEmailConfirmation: false });
  }

  let requiresEmailConfirmation = true;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      next: { revalidate: 300 },
    });
    if (res.ok) {
      const settings = (await res.json()) as { mailer_autoconfirm?: boolean };
      requiresEmailConfirmation = !settings.mailer_autoconfirm;
    }
  } catch {
    /* keep default */
  }

  const callbackUrl =
    process.env.NODE_ENV === "development"
      ? `${getAuthEmailRedirectTo("signup")}`
      : PRODUCTION_SIGNUP_EMAIL_REDIRECT;

  return NextResponse.json({
    requiresEmailConfirmation,
    isDevelopment: process.env.NODE_ENV === "development",
    callbackUrl,
    devHint: process.env.NODE_ENV === "development" ? DEV_EMAIL_CONFIRM_HINT : null,
    redirectUrlsHint:
      process.env.NODE_ENV === "development" ? SUPABASE_REDIRECT_URLS_HINT : null,
  });
}
