import { createClient } from "@/lib/supabase/client";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

/** Mirrors Supabase Auth `PasskeyListItem` (auth-js 2.108.1). */
export type PasskeyListItem = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

type AuthResult<T> = { data: T; error: Error | null };

/** True when this browser can run a WebAuthn ceremony. */
export function isPasskeySupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof window.navigator?.credentials?.create === "function" &&
    typeof window.navigator?.credentials?.get === "function"
  );
}

function isUserCancellation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message.toLowerCase()
      : "";
  return (
    name === "NotAllowedError" ||
    name === "AbortError" ||
    message.includes("timed out") ||
    message.includes("not allowed") ||
    message.includes("the operation either timed out")
  );
}

export function passkeyErrorCode(
  error: unknown
): "unsupported" | "cancelled" | "load_failed" | "failed" {
  if (!isPasskeySupported()) return "unsupported";
  if (isUserCancellation(error)) return "cancelled";
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message ?? "").toLowerCase()
      : "";
  // Safari surfaces failed cross-origin fetches as TypeError "Load failed".
  if (
    message === "load failed" ||
    message.includes("failed to fetch") ||
    message.includes("networkerror")
  ) {
    return "load_failed";
  }
  return "failed";
}

function authV1Base(): string {
  return `${getSupabaseUrl().replace(/\/$/, "")}/auth/v1`;
}

async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

function authHeaders(accessToken: string, jsonBody = false): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    apikey: getSupabaseAnonKey(),
    "X-Supabase-Api-Version": "2024-01-01",
  };
  if (jsonBody) headers["Content-Type"] = "application/json";
  return headers;
}

function asIso(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return undefined;
}

export function normalizePasskeyItem(raw: unknown): PasskeyListItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  if (!id) return null;
  const created =
    asIso(row.created_at) ?? asIso(row.createdAt) ?? new Date(0).toISOString();
  const friendly =
    typeof row.friendly_name === "string"
      ? row.friendly_name
      : typeof row.friendlyName === "string"
        ? row.friendlyName
        : undefined;
  const lastUsed = asIso(row.last_used_at) ?? asIso(row.lastUsedAt);
  return {
    id,
    created_at: created,
    ...(friendly ? { friendly_name: friendly } : {}),
    ...(lastUsed ? { last_used_at: lastUsed } : {}),
  };
}

/**
 * GoTrue returns a bare JSON array for GET /passkeys/.
 * Be defensive if a wrapper object appears in future Auth versions.
 */
export function normalizePasskeyList(data: unknown): PasskeyListItem[] | null {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data
      .map((item) => normalizePasskeyItem(item))
      .filter((item): item is PasskeyListItem => Boolean(item));
  }
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["passkeys", "credentials", "data", "items"]) {
      const nested = obj[key];
      if (Array.isArray(nested)) return normalizePasskeyList(nested);
    }
    const single = normalizePasskeyItem(data);
    if (single) return [single];
  }
  return null;
}

/**
 * Prefer trailing-slash paths: GoTrue mounts list at GET /passkeys/
 * and update/delete at /passkeys/{id}/. auth-js 2.108.1 calls without
 * the slash; Safari often reports the redirect/CORS failure as "Load failed".
 */
async function listPasskeysViaAuthApi(): Promise<AuthResult<PasskeyListItem[]>> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { data: [], error: new Error("Auth session missing") };
  }

  try {
    const response = await fetch(`${authV1Base()}/passkeys/`, {
      method: "GET",
      headers: authHeaders(accessToken),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        data: [],
        error: new Error(text || `Passkey list failed (${response.status})`),
      };
    }
    const json: unknown = await response.json();
    const items = normalizePasskeyList(json);
    if (items == null) {
      return { data: [], error: new Error("Unexpected passkey list response") };
    }
    return { data: items, error: null };
  } catch (error) {
    return {
      data: [],
      error: error instanceof Error ? error : new Error("Passkey list failed"),
    };
  }
}

/** Register a passkey for the currently signed-in user (native Supabase Auth). */
export async function registerUserPasskey() {
  const supabase = createClient();
  return supabase.auth.registerPasskey();
}

/** Sign in with an existing passkey (native Supabase Auth). */
export async function signInWithUserPasskey() {
  const supabase = createClient();
  return supabase.auth.signInWithPasskey();
}

function toError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object" && "message" in err) {
    return new Error(String((err as { message?: unknown }).message ?? fallback));
  }
  return new Error(fallback);
}

export async function listUserPasskeys(): Promise<AuthResult<PasskeyListItem[]>> {
  // Trailing-slash Auth REST first (correct GoTrue route).
  const viaApi = await listPasskeysViaAuthApi();
  if (!viaApi.error) return viaApi;

  // Fallback to SDK in case route conventions differ by Auth version.
  const supabase = createClient();
  const { data, error } = await supabase.auth.passkey.list();
  if (error) {
    return { data: [], error: toError(error, "Passkey list failed") };
  }
  const items = normalizePasskeyList(data);
  if (items == null) {
    return { data: [], error: new Error("Unexpected passkey list response") };
  }
  return { data: items, error: null };
}

export async function renameUserPasskey(
  passkeyId: string,
  friendlyName: string
): Promise<AuthResult<PasskeyListItem | null>> {
  const name = friendlyName.trim().slice(0, 120);
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { data: null, error: new Error("Auth session missing") };
  }

  try {
    const response = await fetch(`${authV1Base()}/passkeys/${passkeyId}/`, {
      method: "PATCH",
      headers: authHeaders(accessToken, true),
      body: JSON.stringify({ friendly_name: name }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        data: null,
        error: new Error(text || `Passkey rename failed (${response.status})`),
      };
    }
    const json: unknown = await response.json();
    return { data: normalizePasskeyItem(json), error: null };
  } catch {
    // Fallback to SDK path without trailing slash.
    const supabase = createClient();
    const { data, error: sdkError } = await supabase.auth.passkey.update({
      passkeyId,
      friendlyName: name,
    });
    if (sdkError) {
      return { data: null, error: toError(sdkError, "Passkey rename failed") };
    }
    return { data: normalizePasskeyItem(data), error: null };
  }
}

export async function deleteUserPasskey(
  passkeyId: string
): Promise<AuthResult<null>> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { data: null, error: new Error("Auth session missing") };
  }

  try {
    const response = await fetch(`${authV1Base()}/passkeys/${passkeyId}/`, {
      method: "DELETE",
      headers: authHeaders(accessToken),
    });
    if (!response.ok && response.status !== 204) {
      const text = await response.text().catch(() => "");
      return {
        data: null,
        error: new Error(text || `Passkey delete failed (${response.status})`),
      };
    }
    return { data: null, error: null };
  } catch {
    const supabase = createClient();
    const { error: sdkError } = await supabase.auth.passkey.delete({ passkeyId });
    if (sdkError) {
      return { data: null, error: toError(sdkError, "Passkey delete failed") };
    }
    return { data: null, error: null };
  }
}
