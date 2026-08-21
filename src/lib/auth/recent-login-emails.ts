/**
 * Device-local recent login emails for login UX autocomplete.
 * Emails only — never passwords, OTP, or tokens.
 * Survives logout (not part of clearPrivateClientStorage).
 */

export const LOOK_RECENT_LOGIN_EMAILS_KEY = "look_recent_login_emails";
/** Non-HttpOnly cookie set after successful form-POST login (Safari path). */
export const LOOK_LAST_LOGIN_EMAIL_COOKIE = "look_last_login_email";
export const MAX_RECENT_LOGIN_EMAILS = 5;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidStoredEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const email = normalizeEmail(value);
  // Lightweight shape check — not full RFC validation.
  return email.length > 2 && email.includes("@") && !email.includes(" ");
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  try {
    const parts = document.cookie.split(";");
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed.startsWith(`${name}=`)) continue;
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  } catch {
    // ignore
  }
  return null;
}

function clearCookie(name: string): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    // ignore
  }
}

export function readRecentLoginEmails(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOOK_RECENT_LOGIN_EMAILS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const emails: string[] = [];
    for (const item of parsed) {
      if (!isValidStoredEmail(item)) continue;
      const email = normalizeEmail(item);
      if (seen.has(email)) continue;
      seen.add(email);
      emails.push(email);
      if (emails.length >= MAX_RECENT_LOGIN_EMAILS) break;
    }
    return emails;
  } catch {
    return [];
  }
}

/** Move email to front (most recent). Dedupes. Caps at MAX. */
export function rememberLoginEmail(email: string): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeEmail(email);
  if (!isValidStoredEmail(normalized)) return;

  try {
    const existing = readRecentLoginEmails().filter((item) => item !== normalized);
    const next = [normalized, ...existing].slice(0, MAX_RECENT_LOGIN_EMAILS);
    window.localStorage.setItem(
      LOOK_RECENT_LOGIN_EMAILS_KEY,
      JSON.stringify(next)
    );
  } catch {
    // ignore quota / private mode
  }
}

/**
 * After a successful HTML form POST login, the server may leave a short-lived
 * email cookie. Absorb it into localStorage (then clear the cookie).
 */
export function absorbLastLoginEmailCookie(): void {
  const fromCookie = readCookie(LOOK_LAST_LOGIN_EMAIL_COOKIE);
  if (fromCookie && isValidStoredEmail(fromCookie)) {
    rememberLoginEmail(fromCookie);
  }
  clearCookie(LOOK_LAST_LOGIN_EMAIL_COOKIE);
}

/** Most recent login email for form prefills (cookie first, then storage). */
export function getRememberedLoginEmail(): string {
  absorbLastLoginEmailCookie();
  return readRecentLoginEmails()[0] ?? "";
}

/**
 * Suggestions matching the current input, most-recent first.
 * Empty query → no app suggestions (lets the browser password manager own focus).
 * Otherwise prefix match.
 */
export function filterRecentLoginEmails(
  query: string,
  limit = MAX_RECENT_LOGIN_EMAILS
): string[] {
  const emails = readRecentLoginEmails();
  const q = normalizeEmail(query);
  if (!q) return [];
  return emails.filter((email) => email.startsWith(q)).slice(0, limit);
}
