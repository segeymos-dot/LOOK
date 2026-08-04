/**
 * Client-side cleanup after sign-out / account switch.
 * Preserves non-private device prefs (locale) unless explicitly cleared.
 */

export const LOOK_AUTH_BROADCAST = "look-auth";
export const LOOK_LOCALE_KEY = "look_locale";

const PRIVATE_STORAGE_KEYS = [
  "look_visitor_id",
  "look_session_id",
  "look_presence_tabs",
] as const;

export type AuthBroadcastMessage =
  | { type: "SIGNED_OUT"; at: number }
  | { type: "SIGNED_IN"; userId: string; at: number };

export function clearPrivateClientStorage(options?: {
  clearLocale?: boolean;
}): void {
  if (typeof window === "undefined") return;

  for (const key of PRIVATE_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  try {
    window.sessionStorage.clear();
  } catch {
    // ignore
  }

  if (options?.clearLocale) {
    try {
      window.localStorage.removeItem(LOOK_LOCALE_KEY);
    } catch {
      // ignore
    }
  }
}

export function broadcastAuthEvent(message: AuthBroadcastMessage): void {
  if (typeof window === "undefined") return;
  try {
    const channel = new BroadcastChannel(LOOK_AUTH_BROADCAST);
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel unsupported — ignore
  }
}

/** Soft navigation barrier so Back cannot resurrect private UI from bfcache. */
export function hardenPostSignOutNavigation(): void {
  if (typeof window === "undefined") return;
  try {
    window.history.pushState(null, "", "/login");
    window.history.pushState(null, "", "/login");
  } catch {
    // ignore
  }
}
