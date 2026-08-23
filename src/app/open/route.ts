import {
  LOOK_OPEN_PATH,
  openDestinationToUrl,
  resolveOpenDestination,
} from "@/lib/open-link";
import { NextResponse } from "next/server";

/**
 * Permanent public entry: https://lookcruise.com/open
 *
 * Today → same-origin web home (no loop: /open ≠ /).
 * Later → App Store / Play / Universal Links without changing this URL.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  // Safety: never redirect /open to itself.
  if (requestUrl.pathname !== LOOK_OPEN_PATH) {
    return NextResponse.redirect(new URL(LOOK_OPEN_PATH, requestUrl.origin), 302);
  }

  const destination = resolveOpenDestination({
    userAgent: request.headers.get("user-agent"),
    searchParams: requestUrl.searchParams,
  });

  const target = openDestinationToUrl(destination, requestUrl);

  if (target.pathname === LOOK_OPEN_PATH) {
    // Guard against misconfiguration creating a loop.
    target.pathname = "/";
  }

  // Temporary redirect: internal target may change when native apps ship.
  const response = NextResponse.redirect(target, 302);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
