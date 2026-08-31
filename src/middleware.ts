import {
  areEquivalentDevHosts,
  getExpectedDevHost,
  PRODUCTION_AUTH_ORIGIN,
} from "@/lib/app-url";
import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse, NextRequest } from "next/server";

const PRODUCTION_APEX_HOST = new URL(PRODUCTION_AUTH_ORIGIN).host; // lookcruise.com

export async function middleware(request: NextRequest) {
  // Stripe webhooks must receive the raw body without session cookie rewrite.
  if (request.nextUrl.pathname.startsWith("/api/webhooks/stripe")) {
    return NextResponse.next();
  }

  const requestHost = request.headers.get("host")?.split(":")[0]?.toLowerCase();

  // Canonical host: www.lookcruise.com → lookcruise.com (no loop; apex stays).
  if (requestHost === `www.${PRODUCTION_APEX_HOST}`) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.host = PRODUCTION_APEX_HOST;
    return NextResponse.redirect(url, 308);
  }

  const expectedHost = getExpectedDevHost();

  // Canonicalize only when hosts truly differ. Never bounce localhost ↔ 127.0.0.1
  // ↔ ::1: Next may emit a path-relative Location and Safari loops forever
  // (/admin/platform → /admin/platform) while cookies stay host-bound.
  if (
    expectedHost &&
    requestHost &&
    requestHost !== expectedHost &&
    !areEquivalentDevHosts(requestHost, expectedHost)
  ) {
    const url = request.nextUrl.clone();
    url.host = expectedHost;
    return NextResponse.redirect(url);
  }

  // Forward edge geo into a stable request header for Node API routes.
  const edgeCountry =
    request.headers.get("x-vercel-ip-country") ||
    request.headers.get("cf-ipcountry") ||
    // NextRequest.geo is available on Vercel edge middleware when present.
    (request as NextRequest & { geo?: { country?: string | null } }).geo
      ?.country ||
    "";
  if (edgeCountry && edgeCountry.trim()) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-look-country-code", edgeCountry.trim().toUpperCase());
    const requestWithGeo = new NextRequest(request, { headers: requestHeaders });
    return await updateSession(requestWithGeo);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks/stripe|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
