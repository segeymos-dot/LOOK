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

/** Persist last login email for the next login form prefill (email only). */
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

/**
 * Classic HTML form POST sign-in + 303 redirect for Safari/iOS Password AutoFill.
 * Auth logic is shared via performPasswordSignIn — password never goes in query/logs.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = rateLimit(`sign-in:${ip}`, 10, 15 * 60 * 1000);
  const requestUrl = new URL(request.url);

  const failRedirect = (code: string, nextPath = "/") => {
    const url = new URL("/login", requestUrl.origin);
    url.searchParams.set("error", code);
    const redirectTo = safeRedirectPath(nextPath);
    if (redirectTo !== "/") {
      url.searchParams.set("redirect", redirectTo);
    }
    return NextResponse.redirect(url, 303);
  };

  if (!limited.ok) {
    return failRedirect("too_many_attempts");
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return failRedirect("invalid_input");
  }

  const email = String(
    formData.get("username") ?? formData.get("email") ?? ""
  ).trim();
  const password = String(formData.get("password") ?? "");
  let redirect = safeRedirectPath(String(formData.get("redirect") ?? ""));

  const parsed = loginSchema.safeParse({ email, password });
  if (!parsed.success) {
    return failRedirect("invalid_input", redirect);
  }

  const successRedirect = NextResponse.redirect(
    new URL(redirect, requestUrl.origin),
    303
  );

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
    return failRedirect("invalid_credentials", redirect);
  }

  setLastLoginEmailCookie(successRedirect, parsed.data.email, requestUrl);

  if (redirect === "/") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", result.user.id)
      .maybeSingle();
    if (profile?.is_platform_admin) {
      redirect = "/admin/stats";
      // Location was baked into successRedirect; rebuild with cookies copied.
      const adminRedirect = NextResponse.redirect(
        new URL(redirect, requestUrl.origin),
        303
      );
      for (const cookie of successRedirect.cookies.getAll()) {
        adminRedirect.cookies.set(cookie);
      }
      setLastLoginEmailCookie(adminRedirect, parsed.data.email, requestUrl);
      return adminRedirect;
    }
  }

  return successRedirect;
}
