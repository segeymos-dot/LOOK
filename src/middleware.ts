import { areEquivalentDevHosts, getExpectedDevHost } from "@/lib/app-url";
import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Stripe webhooks must receive the raw body without session cookie rewrite.
  if (request.nextUrl.pathname.startsWith("/api/webhooks/stripe")) {
    return NextResponse.next();
  }

  const expectedHost = getExpectedDevHost();
  const requestHost = request.headers.get("host");

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

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks/stripe|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
