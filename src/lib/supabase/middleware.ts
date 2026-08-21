import { safeRedirectPath } from "@/lib/app-url";
import { isDemoMode } from "@/lib/config";
import {
  currentLegalConsentCookieValue,
  hasValidLegalConsentCookie,
  isLegalConsentExemptPath,
  LEGAL_CONSENT_COOKIE,
  needsLegalConsent,
  type LegalConsentProfileFields,
} from "@/lib/legal/consent";
import {
  applyAuthCookieOptions,
  getAuthCookieOptions,
  shouldUseSecureAuthCookies,
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

function setLegalConsentCookie(
  response: NextResponse,
  requestUrl: string
) {
  response.cookies.set(LEGAL_CONSENT_COOKIE, currentLegalConsentCookieValue(), {
    path: "/",
    sameSite: "lax",
    secure: shouldUseSecureAuthCookies(requestUrl),
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  });
}

function clearLegalConsentCookie(
  response: NextResponse,
  requestUrl: string
) {
  response.cookies.set(LEGAL_CONSENT_COOKIE, "", {
    path: "/",
    sameSite: "lax",
    secure: shouldUseSecureAuthCookies(requestUrl),
    httpOnly: true,
    maxAge: 0,
  });
}

export async function updateSession(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });
  const requestUrl = request.url;
  const pathname = request.nextUrl.pathname;
  const isApiRoute = pathname.startsWith("/api/");

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

  // API routes must not wait on profiles legal/admin queries in Edge middleware.
  // Each API enforces its own auth (requireAuthContext / requireAdminAuthContext).
  if (isApiRoute) {
    return supabaseResponse;
  }

  const legalCookieOk = hasValidLegalConsentCookie(
    request.cookies.get(LEGAL_CONSENT_COOKIE)?.value
  );

  let consentProfile: LegalConsentProfileFields | null = null;

  const isAdminPath = pathname.startsWith("/admin");
  const needsLegalGate =
    Boolean(user) &&
    !legalCookieOk &&
    (isAuthRoute ||
      pathname.startsWith("/legal/accept") ||
      !isLegalConsentExemptPath(pathname));

  // Only hit profiles when middleware itself must decide admin or legal redirects.
  if (user && (isAdminPath || needsLegalGate)) {
    if (isAdminPath && !needsLegalGate) {
      const { data } = await supabase
        .from("profiles")
        .select("is_platform_admin")
        .eq("id", user.id)
        .maybeSingle();
      consentProfile = data;
    } else {
      const { data } = await supabase
        .from("profiles")
        .select(
          "is_platform_admin, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version, licenses_acknowledged_at, licenses_version, adult_confirmed_at"
        )
        .eq("id", user.id)
        .maybeSingle();
      consentProfile = data;
    }
  }

  const mustAcceptLegal = Boolean(
    user &&
      !legalCookieOk &&
      needsLegalConsent(consentProfile)
  );

  // Cache positive consent so subsequent navigations skip the profiles round-trip.
  if (
    user &&
    consentProfile &&
    !needsLegalConsent(consentProfile) &&
    !legalCookieOk
  ) {
    setLegalConsentCookie(supabaseResponse, requestUrl);
  }

  if (user && isAuthRoute) {
    let nextPath = safeRedirectPath(request.nextUrl.searchParams.get("redirect"));
    if (mustAcceptLegal) {
      clearLegalConsentCookie(supabaseResponse, requestUrl);
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

  if (isAdminPath) {
    if (!user) {
      return redirectWithCookies(request, "/login", supabaseResponse, {
        redirect: safeRedirectPath(pathname),
      });
    }

    if (!consentProfile?.is_platform_admin) {
      return redirectWithCookies(request, "/profile", supabaseResponse);
    }
    return supabaseResponse;
  }

  if (user && mustAcceptLegal && !isLegalConsentExemptPath(pathname)) {
    clearLegalConsentCookie(supabaseResponse, requestUrl);
    return redirectWithCookies(request, "/legal/accept", supabaseResponse, {
      redirect: safeRedirectPath(`${pathname}${request.nextUrl.search}`),
    });
  }

  if (user && !mustAcceptLegal && pathname.startsWith("/legal/accept")) {
    const nextPath = safeRedirectPath(
      request.nextUrl.searchParams.get("redirect")
    );
    return redirectWithCookies(request, nextPath, supabaseResponse);
  }

  return supabaseResponse;
}
