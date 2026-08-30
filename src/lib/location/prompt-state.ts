/**
 * Client prompt frequency — do not spam system permission.
 * DB `location_permission_state` is source of truth across devices;
 * these keys only control device UX for "Not now" / first ask.
 */

const ASKED_KEY = "look_location_prompt_asked";
const DISMISS_SESSION_KEY = "look_location_prompt_dismissed_session";

export function wasLocationPromptAsked(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ASKED_KEY) === "1";
  } catch {
    return true;
  }
}

export function markLocationPromptAsked(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ASKED_KEY, "1");
  } catch {
    // ignore
  }
}

export function isLocationPromptDismissedThisSession(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.sessionStorage.getItem(DISMISS_SESSION_KEY) === "1";
  } catch {
    return true;
  }
}

export function dismissLocationPromptThisSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DISMISS_SESSION_KEY, "1");
  } catch {
    // ignore
  }
}
