import { safeRedirectPath } from "@/lib/app-url";
import { isDemoMode } from "@/lib/config";
import {
  isLegalConsentExemptPath,
  needsLegalConsent,
} from "@/lib/legal/consent";
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

function jsonWithCookies(
  body: unknown,
  status: number,
  supabaseResponse: NextResponse
) {
  const res = NextResponse.json(body, { status });
  for (const cookie of supabaseResponse.cookies.getAll()) {
    res.cookies.set(cookie);
  }
  return res;
}

export async function updateSession(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });
  const requestUrl = request.url;
  const pathname = request.nextUrl.pathname;

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
    pathname.startsWith("/login") || pathname.startsWith("/register");

  const isProtectedRoute =
    pathname.startsWith("/profile") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/finance") ||
    pathname.startsWith("/requests/new") ||
    pathname.match(/^\/requests\/[^/]+\/offer\/?$/) ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/my");

  if (!user && isProtectedRoute) {
    return redirectWithCookies(request, "/login", supabaseResponse, {
      redirect: safeRedirectPath(pathname),
    });
  }

  let consentProfile: {
    is_platform_admin?: boolean | null;
    terms_accepted_at?: string | null;
    terms_version?: string | null;
    privacy_accepted_at?: string | null;
    privacy_version?: string | null;
    licenses_acknowledged_at?: string | null;
    licenses_version?: string | null;
    adult_confirmed_at?: string | null;
  } | null = null;

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select(
        "is_platform_admin, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version, licenses_acknowledged_at, licenses_version, adult_confirmed_at"
      )
      .eq("id", user.id)
      .maybeSingle();
    consentProfile = data;
  }

  const mustAcceptLegal = Boolean(user && needsLegalConsent(consentProfile));

  if (user && isAuthRoute) {
    let nextPath = safeRedirectPath(request.nextUrl.searchParams.get("redirect"));
    if (mustAcceptLegal) {
      return redirectWithCookies(request, "/legal/accept", supabaseResponse, {
        redirect: nextPath === "/" ? "/" : nextPath,
      });
    }
    if (nextPath === "/") {
      if (consentProfile?.is_platform_admin) {
        nextPath = "/admin/stats";
      }
    }
    return redirectWithCookies(request, nextPath, supabaseResponse);
  }

  if (pathname.startsWith("/admin")) {
    if (!user) {
      return redirectWithCookies(request, "/login", supabaseResponse, {
        redirect: safeRedirectPath(pathname),
      });
    }

    if (!consentProfile?.is_platform_admin) {
      return redirectWithCookies(request, "/profile", supabaseResponse);
    }
    // Platform admins: no legal-consent gate (product decision pending).
    return supabaseResponse;
  }

  if (user && mustAcceptLegal && !isLegalConsentExemptPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return jsonWithCookies(
        {
          success: false,
          error: "Требуется принять актуальные юридические документы",
          code: "LEGAL_CONSENT_REQUIRED",
        },
        403,
        supabaseResponse
      );
    }

    return redirectWithCookies(request, "/legal/accept", supabaseResponse, {
      redirect: safeRedirectPath(`${pathname}${request.nextUrl.search}`),
    });
  }

  if (
    user &&
    !mustAcceptLegal &&
    pathname.startsWith("/legal/accept")
  ) {
    const nextPath = safeRedirectPath(
      request.nextUrl.searchParams.get("redirect")
    );
    return redirectWithCookies(request, nextPath, supabaseResponse);
  }

  return supabaseResponse;
}
