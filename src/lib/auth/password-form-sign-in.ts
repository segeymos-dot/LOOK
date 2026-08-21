import { LOOK_LAST_LOGIN_EMAIL_COOKIE } from "@/lib/auth/recent-login-emails";
import { performPasswordSignIn } from "@/lib/auth/perform-password-sign-in";
import { safeRedirectPath } from "@/lib/app-url";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  applyAuthCookieOptions,
  getAuthCookieOptions,
} from "@/lib/supabase/auth-cookie-options";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { loginSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

function setLastLoginEmailCookie(
  response: NextResponse,
  email: string,
  requestUrl: URL
) {
  response.cookies.set(LOOK_LAST_LOGIN_EMAIL_COOKIE, email.trim().toLowerCase(), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: requestUrl.protocol === "https:",
    httpOnly: false,
  });
}

function parseRequestCookies(request: Request): { name: string; value: string }[] {
  const raw = request.headers.get("cookie") ?? "";
  if (!raw.trim()) return [];
  return raw.split(";").flatMap((part) => {
    const trimmed = part.trim();
    if (!trimmed) return [];
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return [];
    return [{ name: trimmed.slice(0, eq), value: trimmed.slice(eq + 1) }];
  });
}

function failRedirect(requestUrl: URL, code: string, nextPath = "/") {
  const url = new URL("/login", requestUrl.origin);
  url.searchParams.set("error", code);
  const redirectTo = safeRedirectPath(nextPath);
  if (redirectTo !== "/") {
    url.searchParams.set("redirect", redirectTo);
  }
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * HTML form POST password sign-in for Safari/iOS Password AutoFill.
 *
 * Success returns 303 → `/login/done?next=…` (a real 200 HTML document).
 * Safari is far more reliable at offering "Save Password" after a classic
 * form navigation that lands on an HTML page than after an XHR/fetch login
 * or a bare hop straight into a client-rendered app shell.
 *
 * Password is never logged or stored by the app.
 */
export async function handlePasswordFormSignIn(
  request: Request
): Promise<NextResponse> {
  const ip = getClientIp(request);
  const limited = rateLimit(`sign-in:${ip}`, 10, 15 * 60 * 1000);
  const requestUrl = new URL(request.url);

  if (!limited.ok) {
    return failRedirect(requestUrl, "too_many_attempts");
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return failRedirect(requestUrl, "invalid_input");
  }

  const email = String(
    formData.get("username") ?? formData.get("email") ?? ""
  ).trim();
  const password = String(formData.get("password") ?? "");
  let nextPath = safeRedirectPath(String(formData.get("redirect") ?? ""));

  const parsed = loginSchema.safeParse({ email, password });
  if (!parsed.success) {
    return failRedirect(requestUrl, "invalid_input", nextPath);
  }

  // Bridge page: 200 HTML after form POST is what iOS Safari uses to offer Save Password.
  const doneUrl = new URL("/login/done", requestUrl.origin);
  doneUrl.searchParams.set("next", nextPath);

  const successRedirect = NextResponse.redirect(doneUrl, 303);
  successRedirect.headers.set("Cache-Control", "no-store");

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookieOptions: getAuthCookieOptions(requestUrl),
    cookies: {
      getAll() {
        return parseRequestCookies(request);
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          successRedirect.cookies.set(
            name,
            value,
            applyAuthCookieOptions(options, requestUrl)
          );
        });
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
    return failRedirect(requestUrl, "invalid_credentials", nextPath);
  }

  if (nextPath === "/") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", result.user.id)
      .maybeSingle();
    if (profile?.is_platform_admin) {
      nextPath = "/admin/stats";
      doneUrl.searchParams.set("next", nextPath);
      const adminRedirect = NextResponse.redirect(doneUrl, 303);
      adminRedirect.headers.set("Cache-Control", "no-store");
      for (const cookie of successRedirect.cookies.getAll()) {
        adminRedirect.cookies.set(cookie);
      }
      setLastLoginEmailCookie(adminRedirect, parsed.data.email, requestUrl);
      return adminRedirect;
    }
  }

  setLastLoginEmailCookie(successRedirect, parsed.data.email, requestUrl);
  return successRedirect;
}
