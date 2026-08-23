/**
 * Permanent public entry URL for QR / social / ads.
 * The path `/open` must stay stable; only the resolver below may change.
 */

/** Stable path — never rename without migrating all printed/QR materials. */
export const LOOK_OPEN_PATH = "/open";

/** Canonical production URL used in QR and marketing (matches PRODUCTION_AUTH_ORIGIN). */
export const LOOK_PUBLIC_OPEN_URL = `https://lookcruise.com${LOOK_OPEN_PATH}`;

export type OpenPlatform = "ios" | "android" | "desktop" | "unknown";

export type OpenDestination =
  | { kind: "web"; path: string }
  | { kind: "app_store"; url: string }
  | { kind: "play_store"; url: string }
  | { kind: "custom_scheme"; url: string };

/**
 * Optional future env (leave unset until stores exist):
 * - LOOK_IOS_APP_STORE_URL
 * - LOOK_ANDROID_PLAY_STORE_URL
 * - LOOK_IOS_UNIVERSAL_LINK_ENABLED=1
 * - LOOK_ANDROID_APP_LINK_ENABLED=1
 */
export function detectOpenPlatform(userAgent: string | null): OpenPlatform {
  const ua = (userAgent ?? "").toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (!ua.trim()) return "unknown";
  return "desktop";
}

/**
 * Resolve where `/open` should send the user.
 * Today: always web home (LOOK not on App Store / Play yet).
 * Later: branch on platform + store URLs / installed-app detection.
 */
export function resolveOpenDestination(input: {
  userAgent: string | null;
  searchParams?: URLSearchParams;
}): OpenDestination {
  const platform = detectOpenPlatform(input.userAgent);

  // Future: if store URLs are configured and we decide to send mobile users
  // to the store when the app is not installed, enable those branches here.
  const iosStore = process.env.LOOK_IOS_APP_STORE_URL?.trim();
  const playStore = process.env.LOOK_ANDROID_PLAY_STORE_URL?.trim();

  // Intentionally unused until apps ship — keeps wiring discoverable.
  void platform;
  void iosStore;
  void playStore;

  // Preserve campaign query params on the web landing path.
  const path = "/";
  if (input.searchParams && [...input.searchParams.keys()].length > 0) {
    const q = input.searchParams.toString();
    return { kind: "web", path: q ? `${path}?${q}` : path };
  }
  return { kind: "web", path };
}

export function openDestinationToUrl(
  destination: OpenDestination,
  requestUrl: URL
): URL {
  switch (destination.kind) {
    case "web": {
      const url = new URL(destination.path, requestUrl.origin);
      return url;
    }
    case "app_store":
    case "play_store":
    case "custom_scheme":
      return new URL(destination.url);
    default: {
      const _exhaustive: never = destination;
      return _exhaustive;
    }
  }
}
