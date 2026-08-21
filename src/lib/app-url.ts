const DEFAULT_DEV_ORIGIN = "http://localhost:3000";
export const PRODUCTION_AUTH_ORIGIN = "https://lookcruise.com";

/**
 * Stable Vercel git-branch alias for staging-preview.
 * Prefer this over per-deployment `look-<hash>-….vercel.app` URLs when testing
 * Safari/iOS Password AutoFill (credentials are hostname-scoped).
 */
export const STAGING_PREVIEW_ORIGIN =
  "https://look-git-staging-preview-lookcruise.vercel.app";

/** Supabase allow-list match is exact — no query string on signup confirmation. */
export const PRODUCTION_SIGNUP_EMAIL_REDIRECT = `${PRODUCTION_AUTH_ORIGIN}/auth/callback`;
export const PRODUCTION_RESET_EMAIL_REDIRECT = `${PRODUCTION_AUTH_ORIGIN}/auth/callback?next=/reset-password`;

function normalizeOrigin(origin?: string): string | undefined {
  return origin?.trim()?.replace(/\/$/, "") || undefined;
}

/** True when Next is started by the local Electron shell (`LOOK_PORT` / `LOOK_DESKTOP`). */
function isDesktopShellRuntime(): boolean {
  return Boolean(process.env.LOOK_DESKTOP === "1" || process.env.LOOK_PORT?.trim());
}

/** True for localhost, 127.0.0.1, and desktop shell port 3010. */
export function isLocalAuthOrigin(origin: string): boolean {
  try {
    const { hostname, port } = new URL(origin);
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]"
    ) {
      return true;
    }
    return port === "3010";
  } catch {
    return true;
  }
}

/**
 * Origin for Supabase emailRedirectTo / auth callback links.
 * Production never uses localhost, 127.0.0.1, or :3010 — even if Origin header says so.
 */
export function getAuthRedirectOrigin(fallbackOrigin?: string): string {
  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const normalizedFallback = normalizeOrigin(fallbackOrigin);

  if (process.env.NODE_ENV === "development") {
    if (normalizedFallback) return normalizedFallback;
    if (configured) return configured;
    return DEFAULT_DEV_ORIGIN;
  }

  if (configured && !isLocalAuthOrigin(configured)) return configured;
  if (normalizedFallback && !isLocalAuthOrigin(normalizedFallback)) {
    return normalizedFallback;
  }
  return PRODUCTION_AUTH_ORIGIN;
}

/**
 * Public app origin for absolute URLs (e.g. redirects).
 * Vercel/production never returns localhost. Electron desktop shell may use 127.0.0.1:3010.
 */
export function getAppOrigin(fallbackOrigin?: string): string {
  const normalizedFallback = normalizeOrigin(fallbackOrigin);
  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const desktop = isDesktopShellRuntime();

  // In dev prefer the actual request origin (supports desktop :3010 vs dev :3000).
  if (process.env.NODE_ENV === "development" && normalizedFallback) {
    return normalizedFallback;
  }

  if (configured && !isLocalAuthOrigin(configured)) {
    return configured;
  }
  if (normalizedFallback && !isLocalAuthOrigin(normalizedFallback)) {
    return normalizedFallback;
  }

  // Local Electron shell runs `next start` (NODE_ENV=production) on LOOK_PORT.
  if (desktop) {
    if (configured) return configured;
    if (normalizedFallback) return normalizedFallback;
    const port = process.env.LOOK_PORT?.trim() || "3010";
    return `http://127.0.0.1:${port}`;
  }

  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_AUTH_ORIGIN;
  }

  if (configured) return configured;
  if (normalizedFallback) return normalizedFallback;
  return DEFAULT_DEV_ORIGIN;
}

export function getExpectedDevHost(): string | null {
  if (process.env.NODE_ENV !== "development") return null;
  try {
    return new URL(getAppOrigin()).host;
  } catch {
    return "localhost:3000";
  }
}

/** Loopback aliases that must not redirect to each other (Safari redirect loops). */
function loopbackHostname(host: string): string | null {
  const hostname = host.trim().toLowerCase().split(":")[0] ?? "";
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  ) {
    return "loopback";
  }
  return null;
}

/**
 * True when both Host values are the same local machine under different aliases
 * (localhost ↔ 127.0.0.1 ↔ ::1). Redirecting between these causes relative
 * Location loops in Safari while cookies bind to only one host.
 */
export function areEquivalentDevHosts(a: string, b: string): boolean {
  if (a === b) return true;
  const portOf = (host: string) => {
    const idx = host.lastIndexOf(":");
    if (idx <= 0) return "";
    // IPv6 like [::1]:3000
    if (host.startsWith("[")) {
      const end = host.indexOf("]");
      return end >= 0 && host[end + 1] === ":" ? host.slice(end + 2) : "";
    }
    return host.slice(idx + 1);
  };
  const aLoop = loopbackHostname(a);
  const bLoop = loopbackHostname(b);
  if (!aLoop || !bLoop) return false;
  return portOf(a) === portOf(b);
}

/**
 * Safe internal post-auth path. Rejects external URLs, protocol-relative URLs,
 * auth routes (prevents login↔login loops), and nested redirect query noise.
 */
export function safeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  let path = value;
  try {
    const parsed = new URL(value, "http://local.invalid");
    path = parsed.pathname || "/";
  } catch {
    return "/";
  }

  if (
    path === "/login" ||
    path === "/register" ||
    path.startsWith("/login/") ||
    path.startsWith("/register/") ||
    path.startsWith("/auth/")
  ) {
    return "/";
  }

  return path;
}

export function getAuthEmailRedirectTo(kind: "signup" | "reset" = "signup"): string {
  if (process.env.NODE_ENV === "development") {
    const origin = getAuthRedirectOrigin();
    return kind === "reset"
      ? `${origin}/auth/callback?next=/reset-password`
      : `${origin}/auth/callback`;
  }
  return kind === "reset"
    ? PRODUCTION_RESET_EMAIL_REDIRECT
    : PRODUCTION_SIGNUP_EMAIL_REDIRECT;
}

export function getClientAppOrigin(): string {
  if (typeof window !== "undefined") {
    return getAuthRedirectOrigin(window.location.origin);
  }
  return getAuthRedirectOrigin();
}
