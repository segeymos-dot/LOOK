import { safeRedirectPath } from "@/lib/app-url";
import { isDemoMode } from "@/lib/config";
import {
  applyAuthCookieOptions,
  getAuthCookieOptions,
} from "@/lib/supabase/auth-cookie-options";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Redirect while preserving any cookies written onto supabaseResponse (token refresh). */
function redirectWithCookies(
  request: NextRequest,
  pathname: string,
  supabaseResponse: NextResponse,
  searchParams?: Record<string, string>
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }
  const redirectResponse = NextResponse.redirect(url);
  for (const cookie of supabaseResponse.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  return redirectResponse;
}

export async function updateSession(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });
  const requestUrl = request.url;

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookieOptions: getAuthCookieOptions(requestUrl),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(
              name,
              value,
              applyAuthCookieOptions(options, requestUrl)
            )
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/register");

  const isProtectedRoute =
    request.nextUrl.pathname.startsWith("/profile") ||
    request.nextUrl.pathname.startsWith("/settings") ||
    request.nextUrl.pathname.startsWith("/finance") ||
    request.nextUrl.pathname.startsWith("/requests/new") ||
    request.nextUrl.pathname.match(/^\/requests\/[^/]+\/offer\/?$/) ||
    request.nextUrl.pathname.startsWith("/chat") ||
    request.nextUrl.pathname.startsWith("/my");

  if (!user && isProtectedRoute) {
    return redirectWithCookies(
      request,
      "/login",
      supabaseResponse,
      { redirect: safeRedirectPath(request.nextUrl.pathname) }
    );
  }

  if (user && isAuthRoute) {
    let nextPath = safeRedirectPath(request.nextUrl.searchParams.get("redirect"));
    if (nextPath === "/") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_platform_admin")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.is_platform_admin) {
        nextPath = "/admin/stats";
      }
    }
    return redirectWithCookies(request, nextPath, supabaseResponse);
  }

  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!user) {
      return redirectWithCookies(
        request,
        "/login",
        supabaseResponse,
        { redirect: safeRedirectPath(request.nextUrl.pathname) }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_platform_admin) {
      return redirectWithCookies(request, "/profile", supabaseResponse);
    }
  }

  return supabaseResponse;
}
