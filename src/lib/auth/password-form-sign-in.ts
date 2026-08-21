import { LOOK_LAST_LOGIN_EMAIL_COOKIE } from "@/lib/auth/recent-login-emails";
import { safeRedirectPath } from "@/lib/app-url";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validations";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
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
 * Success → 303 /login/done (200 HTML bridge) so Safari can offer Save Password.
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
  const nextPath = safeRedirectPath(String(formData.get("redirect") ?? ""));

  const parsed = loginSchema.safeParse({ email, password });
  if (!parsed.success) {
    return failRedirect(requestUrl, "invalid_input", nextPath);
  }

  const doneUrl = new URL("/login/done", requestUrl.origin);
  doneUrl.searchParams.set("next", nextPath);

  const successRedirect = NextResponse.redirect(doneUrl, 303);
  successRedirect.headers.set("Cache-Control", "no-store");

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return parseRequestCookies(request);
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value, options }) => {
            successRedirect.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user || !data.session) {
    return failRedirect(requestUrl, "invalid_credentials", nextPath);
  }

  setLastLoginEmailCookie(successRedirect, parsed.data.email, requestUrl);
  return successRedirect;
}
