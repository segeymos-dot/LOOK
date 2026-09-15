import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isDuplicateConfirmedSignup } from "@/lib/auth/email-confirmation";
import { getAuthEmailRedirectTo } from "@/lib/app-url";
import {
  buildLegalConsentWrite,
  recordLegalAcceptances,
} from "@/lib/legal/record-acceptances";
import {
  CURRENT_LICENSES_VERSION,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "@/lib/legal/versions";
import { createClient } from "@/lib/supabase/server";
import { mapAuthError } from "@/lib/test-auth";
import { registerSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

/** All new accounts start as customer; provider mode requires onboarding. */
const SIGNUP_ROLE = "customer" as const;

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = rateLimit(`sign-up:${ip}`, 5, 60 * 60 * 1000);
  if (!limited.ok) {
    return rateLimitResponse(limited.retryAfterSec);
  }

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  if (parsed.data.acceptedTerms !== true) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Необходимо принять Пользовательское соглашение, Политику конфиденциальности и подтвердить возраст 18+",
      },
      { status: 400 }
    );
  }

  const acceptedAt = new Date().toISOString();
  const consent = buildLegalConsentWrite(acceptedAt);
  const emailRedirectTo = getAuthEmailRedirectTo("signup");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo,
      data: {
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
        full_name: parsed.data.full_name,
        role: SIGNUP_ROLE,
        phone: parsed.data.phone || null,
        country: parsed.data.country || null,
        city: parsed.data.city || null,
        avatar_url: parsed.data.avatar_url || null,
        bio: parsed.data.bio || null,
        skills: null,
        portfolio: null,
        provider_category_slugs: [],
        accepted_terms: "true",
        terms_version: CURRENT_TERMS_VERSION,
        privacy_version: CURRENT_PRIVACY_VERSION,
        licenses_version: CURRENT_LICENSES_VERSION,
        terms_accepted_at: acceptedAt,
        privacy_accepted_at: acceptedAt,
        licenses_acknowledged_at: acceptedAt,
        adult_confirmed_at: acceptedAt,
      },
    },
  });

  if (error) {
    return NextResponse.json(
      { success: false, error: mapAuthError(error.message) },
      { status: error.message.toLowerCase().includes("rate limit") ? 429 : 400 }
    );
  }

  if (isDuplicateConfirmedSignup(data.user)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Этот email уже зарегистрирован и подтверждён. Войдите в аккаунт или восстановите пароль.",
      },
      { status: 400 }
    );
  }

  const emailConfirmed = Boolean(data.user?.email_confirmed_at);
  // Never hand the browser a session for an unconfirmed email. Profile rows
  // are created by handle_new_user from signup metadata when confirm is required.
  const sessionForClient =
    data.session && data.user && emailConfirmed ? data.session : null;

  if (sessionForClient && data.user) {
    await supabase
      .from("profiles")
      .update({
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
        full_name: parsed.data.full_name,
        role: SIGNUP_ROLE,
        phone: parsed.data.phone || null,
        country: parsed.data.country || null,
        city: parsed.data.city || null,
        avatar_url: parsed.data.avatar_url || null,
        bio: parsed.data.bio || null,
        skills: null,
        portfolio: null,
        provider_category_slugs: [],
        ...consent,
      })
      .eq("id", data.user.id);

    await recordLegalAcceptances(
      supabase,
      data.user.id,
      "signup",
      acceptedAt
    );
  }

  // Drop any unexpected unconfirmed session so the client cannot stay signed in.
  if (data.session && !emailConfirmed) {
    await supabase.auth.signOut().catch(() => undefined);
  }

  return NextResponse.json({
    success: true,
    user: data.user,
    session: sessionForClient
      ? {
          access_token: sessionForClient.access_token,
          refresh_token: sessionForClient.refresh_token,
        }
      : null,
    email: parsed.data.email,
    requiresEmailConfirmation: !sessionForClient,
    emailRedirectTo,
  });
}
