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

  const requestUrl = request.url;
  const pathname = request.nextUrl.pathname;
  const isApiRoute = pathname.startsWith("/api/");

  // Password form POST owns Set-Cookie + 303 entirely. Do not run getUser /
  // cookie rewrite here — it can interfere with Safari Save Password.
  if (
    request.method === "POST" &&
    (pathname === "/login/submit" || pathname === "/api/auth/sign-in-form")
  ) {
    return NextResponse.next();
  }

  // Post-login HTML bridge must stay a 200 document for Safari Save Password.
  if (pathname === "/login/done") {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

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

  // Public marketing entry: "/" must never redirect to /login or /profile.
  // Guests and authenticated users both see HOME; auth is opt-in via UI.
  // (Protected routes below still require a session.)

  // Only the login/register entry pages — not /login/submit or /login/done.
  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/register/");

  const isProtectedRoute =
    pathname !== "/" &&
    (pathname.startsWith("/profile") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/finance") ||
      pathname.startsWith("/requests/new") ||
      pathname.match(/^\/requests\/[^/]+\/offer\/?$/) ||
      pathname.startsWith("/chat") ||
      pathname.startsWith("/my"));

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

  // Admin gate MUST only select is_platform_admin.
  // Selecting legal-consent columns that are not yet on production makes
  // PostgREST return an error → consentProfile=null → every /admin/* request
  // was 307'd back to /profile (looked like a dead "Админ-панель" button).
  if (isAdminPath) {
    if (!user) {
      return redirectWithCookies(request, "/login", supabaseResponse, {
        redirect: safeRedirectPath(pathname),
      });
    }

    const { data: adminProfile, error: adminProfileError } = await supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (adminProfileError) {
      console.error(
        "[middleware] admin profile lookup failed",
        adminProfileError.message
      );
    }

    if (!adminProfile?.is_platform_admin) {
      return redirectWithCookies(request, "/profile", supabaseResponse);
    }

    return supabaseResponse;
  }

  const needsLegalGate =
    Boolean(user) &&
    !legalCookieOk &&
    (isAuthRoute ||
      pathname.startsWith("/legal/accept") ||
      !isLegalConsentExemptPath(pathname));

  // Only hit profiles when middleware itself must decide legal redirects.
  // Prefer a lean admin flag query; legal columns are optional (may be absent).
  if (user && needsLegalGate) {
    const full = await supabase
      .from("profiles")
      .select(
        "is_platform_admin, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version, licenses_acknowledged_at, licenses_version, adult_confirmed_at"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (full.error) {
      console.error("[middleware] legal profile lookup failed", full.error.message);
      const lean = await supabase
        .from("profiles")
        .select("is_platform_admin")
        .eq("id", user.id)
        .maybeSingle();
      consentProfile = lean.data;
    } else {
      consentProfile = full.data;
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
      } else {
        // Auth routes may not have loaded consentProfile when legal cookie is ok.
        const { data: adminFlag } = await supabase
          .from("profiles")
          .select("is_platform_admin")
          .eq("id", user.id)
          .maybeSingle();
        if (adminFlag?.is_platform_admin) {
          nextPath = "/admin/stats";
        }
      }
    }
    return redirectWithCookies(request, nextPath, supabaseResponse);
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
