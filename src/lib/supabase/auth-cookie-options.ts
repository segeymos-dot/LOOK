import type { CookieOptions } from "@supabase/ssr";

/**
 * Auth cookie defaults. Secure only on HTTPS so localhost/http dev still works.
 */
export function shouldUseSecureAuthCookies(requestUrl?: string | URL | null): boolean {
  if (requestUrl) {
    try {
      return new URL(requestUrl).protocol === "https:";
    } catch {
      // fall through
    }
  }
  if (typeof window !== "undefined") {
    return window.location.protocol === "https:";
  }
  // Vercel app traffic is HTTPS; local `next dev` / `next start` stay non-Secure.
  return process.env.VERCEL === "1";
}

export function getAuthCookieOptions(
  requestUrl?: string | URL | null
): Pick<CookieOptions, "path" | "sameSite" | "secure"> {
  return {
    path: "/",
    sameSite: "lax",
    secure: shouldUseSecureAuthCookies(requestUrl),
  };
}

/** Merge Secure/path/sameSite onto cookies written by @supabase/ssr. */
export function applyAuthCookieOptions(
  options: CookieOptions,
  requestUrl?: string | URL | null
): CookieOptions {
  const defaults = getAuthCookieOptions(requestUrl);
  return {
    ...options,
    path: options.path ?? defaults.path,
    sameSite: options.sameSite ?? defaults.sameSite,
    secure: defaults.secure ? true : Boolean(options.secure),
  };
}
