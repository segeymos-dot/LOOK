/**
 * Progressive enhancement: offer the device/browser password manager a chance
 * to save credentials after a successful login.
 *
 * Uses Credential Management API when available (Chrome / Android).
 * Safari/iOS rely primarily on correct form autocomplete + successful login UX.
 *
 * Never writes passwords to localStorage, sessionStorage, cookies, IndexedDB,
 * analytics, URLs, or app APIs. Failures are ignored — login must not break.
 */

type PasswordCredentialLike = Credential & { id: string; password?: string };

type PasswordCredentialCtor = new (
  init: HTMLFormElement | { id: string; password: string }
) => PasswordCredentialLike;

function getPasswordCredentialCtor(): PasswordCredentialCtor | null {
  if (typeof window === "undefined") return null;
  try {
    const ctor = (window as unknown as { PasswordCredential?: PasswordCredentialCtor })
      .PasswordCredential;
    return typeof ctor === "function" ? ctor : null;
  } catch {
    return null;
  }
}

function canUseCredentialsApi(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      "credentials" in navigator &&
      typeof navigator.credentials?.store === "function" &&
      getPasswordCredentialCtor() !== null
    );
  } catch {
    return false;
  }
}

/**
 * Call only after a confirmed successful sign-in.
 * Safe no-op when unsupported, declined, or any error occurs.
 * Never logs credential material.
 */
export async function offerPasswordManagerSave(
  form: HTMLFormElement | null,
  fallback?: { email: string; password: string }
): Promise<void> {
  if (!canUseCredentialsApi()) return;

  const PasswordCredential = getPasswordCredentialCtor();
  if (!PasswordCredential || !navigator.credentials?.store) return;

  try {
    let credential: PasswordCredentialLike | null = null;

    if (form) {
      credential = new PasswordCredential(form);
    } else if (fallback?.email && fallback.password) {
      credential = new PasswordCredential({
        id: fallback.email.trim(),
        password: fallback.password,
      });
    }

    if (!credential) return;
    await navigator.credentials.store(credential);
  } catch {
    // Unsupported, malformed form, or user declined — login already succeeded.
  }
}

/** Read email/password from the live form DOM (captures browser autofill). */
export function readLoginCredentialsFromForm(
  form: HTMLFormElement,
  fallback: { email: string; password: string }
): { email: string; password: string } {
  const data = new FormData(form);
  const email = String(
    data.get("username") ?? data.get("email") ?? fallback.email ?? ""
  ).trim();
  const password = String(data.get("password") ?? fallback.password ?? "");
  return {
    email: email || fallback.email.trim(),
    password: password || fallback.password,
  };
}
