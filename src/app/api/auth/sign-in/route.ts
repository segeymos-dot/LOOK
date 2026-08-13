import { performPasswordSignIn } from "@/lib/auth/perform-password-sign-in";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  applyAuthCookieOptions,
  getAuthCookieOptions,
} from "@/lib/supabase/auth-cookie-options";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { mapAuthError } from "@/lib/test-auth";
import { loginSchema } from "@/lib/validations";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";

function parseRequestCookies(request: Request): { name: string; value: string }[] {
  const header = request.headers.get("cookie") ?? "";
  if (!header.trim()) return [];
  return header.split(";").flatMap((part) => {
    const trimmed = part.trim();
    if (!trimmed) return [];
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return [];
    return [{ name: trimmed.slice(0, eq), value: trimmed.slice(eq + 1) }];
  });
}

/**
 * Password sign-in: this Route Handler response is the sole writer of the
 * Supabase SSR auth cookie. Tokens are not returned to the client so the
 * browser cannot dual-write via setSession.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = rateLimit(`sign-in:${ip}`, 10, 15 * 60 * 1000);
  if (!limited.ok) {
    return rateLimitResponse(limited.retryAfterSec);
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const pendingCookies: {
    name: string;
    value: string;
    options: CookieOptions;
  }[] = [];

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookieOptions: getAuthCookieOptions(request.url),
    cookies: {
      getAll() {
        return parseRequestCookies(request);
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[]
      ) {
        pendingCookies.push(...cookiesToSet);
      },
    },
  });

  const result = await performPasswordSignIn(supabase, {
    email: parsed.data.email,
    password: parsed.data.password,
    request,
    ip,
  });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: mapAuthError(result.errorMessage) },
      { status: 401 }
    );
  }

  const response = NextResponse.json({
    success: true,
    user: { id: result.user.id },
  });

  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(
      name,
      value,
      applyAuthCookieOptions(options, request.url)
    );
  }

  return response;
}
