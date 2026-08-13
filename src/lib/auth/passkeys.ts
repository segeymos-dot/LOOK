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

type PasskeyDiagEvent =
  | "registration_preflight"
  | "registration_options_ok"
  | "registration_options_error"
  | "credential_created"
  | "credential_create_error"
  | "registration_verify_started"
  | "registration_verify_ok"
  | "registration_verify_error"
  | "registration_persist_ok"
  | "registration_persist_error";

/** Staging-only safe ceremony breadcrumbs (no secrets / rawIds / attestation). */
function passkeyDiag(
  event: PasskeyDiagEvent,
  detail?: Record<string, string | number | boolean | null | undefined>
) {
  if (typeof window === "undefined") return;
  if (window.location.hostname !== "staging.lookcruise.com") return;
  console.info("[look:passkey]", event, detail ?? {});
}

function base64UrlToBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function deserializeCreationOptions(
  options: Record<string, unknown>
): PublicKeyCredentialCreationOptions {
  const parseJson = (
    PublicKeyCredential as unknown as {
      parseCreationOptionsFromJSON?: (
        opts: Record<string, unknown>
      ) => PublicKeyCredentialCreationOptions;
    }
  ).parseCreationOptionsFromJSON;
  if (typeof parseJson === "function") {
    return parseJson(options);
  }

  const challenge = options.challenge;
  const user = options.user as { id: string; name: string; displayName: string };
  if (typeof challenge !== "string" || !user?.id) {
    throw new Error("Invalid passkey creation options");
  }

  const excludeCredentials = Array.isArray(options.excludeCredentials)
    ? (options.excludeCredentials as Array<{ id: string; type: string; transports?: string[] }>).map(
        (cred) => ({
          type: cred.type as PublicKeyCredentialType,
          id: base64UrlToBuffer(cred.id),
          transports: cred.transports as AuthenticatorTransport[] | undefined,
        })
      )
    : undefined;

  return {
    ...(options as object),
    challenge: base64UrlToBuffer(challenge),
    user: {
      ...user,
      id: base64UrlToBuffer(user.id),
    },
    ...(excludeCredentials ? { excludeCredentials } : {}),
  } as PublicKeyCredentialCreationOptions;
}

function serializeCreationCredential(credential: PublicKeyCredential) {
  const withJson = credential as PublicKeyCredential & {
    toJSON?: () => Record<string, unknown>;
  };
  if (typeof withJson.toJSON === "function") {
    return withJson.toJSON();
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: bufferToBase64Url(response.attestationObject),
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
  };
}

function isRetryablePasskeyNetworkError(error: unknown): boolean {
  return passkeyErrorCode(error) === "load_failed";
}

function toError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object" && "message" in err) {
    return new Error(String((err as { message?: unknown }).message ?? fallback));
  }
  return new Error(fallback);
}

const SESSION_REFRESH_SKEW_SEC = 120;

/** Refresh only when session is missing or access token is near expiry. */
async function ensureFreshSession(
  supabase: ReturnType<typeof createClient>,
  expectedUserId: string
): Promise<{ ok: true } | { ok: false; error: Error }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = session?.expires_at ?? 0;
  const needsRefresh =
    !session?.access_token ||
    (expiresAt > 0 && expiresAt - now <= SESSION_REFRESH_SKEW_SEC);

  if (!needsRefresh) {
    if (session?.user?.id && session.user.id !== expectedUserId) {
      return { ok: false, error: new Error("Auth session user mismatch") };
    }
    return { ok: true };
  }

  const refreshed = await supabase.auth.refreshSession();
  const next = refreshed.data.session;
  if (refreshed.error || !next?.access_token) {
    return {
      ok: false,
      error: toError(refreshed.error, "Auth session missing"),
    };
  }
  if (next.user?.id && next.user.id !== expectedUserId) {
    return { ok: false, error: new Error("Auth session user mismatch") };
  }
  return { ok: true };
}

function authErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  if ("code" in error && error.code != null) return String(error.code);
  return null;
}

/**
 * Register a passkey via native Supabase Auth two-step ceremony:
 * startRegistration → navigator.credentials.create → verifyRegistration.
 *
 * Explicit steps (instead of opaque registerPasskey) so Safari/iOS cannot
 * leave an orphan registration challenge after Face ID create without verify.
 */
export async function registerUserPasskey(): Promise<
  AuthResult<{
    id: string;
    friendly_name?: string;
    created_at: string;
  } | null>
> {
  const supabase = createClient();

  if (!isPasskeySupported()) {
    return { data: null, error: new Error("Passkeys are not supported") };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    passkeyDiag("registration_preflight", { ok: false, reason: "no_user" });
    return { data: null, error: toError(userError, "Auth session missing") };
  }
  if (user.is_anonymous) {
    passkeyDiag("registration_preflight", { ok: false, reason: "anonymous" });
    return { data: null, error: new Error("Anonymous users cannot register passkeys") };
  }

  const preflight = await ensureFreshSession(supabase, user.id);
  if (!preflight.ok) {
    passkeyDiag("registration_preflight", { ok: false, reason: "no_session" });
    return { data: null, error: preflight.error };
  }

  passkeyDiag("registration_preflight", {
    ok: true,
    userPrefix: user.id.slice(0, 8),
    emailConfirmed: Boolean(user.email_confirmed_at),
  });

  const beforeList = await listUserPasskeys();
  const beforeIds = new Set(beforeList.data.map((item) => item.id));

  const started = await supabase.auth.passkey.startRegistration();
  if (started.error || !started.data?.challenge_id || !started.data.options) {
    passkeyDiag("registration_options_error", {
      message: started.error?.message ?? "missing_options",
    });
    return {
      data: null,
      error: toError(started.error, "Passkey registration options failed"),
    };
  }

  const challengeId = started.data.challenge_id;
  const options = started.data.options as {
    rp?: { id?: string };
    user?: { name?: string; displayName?: string };
  };
  const rpId = options.rp?.id ?? null;
  const optionsUserName = options.user?.name ?? null;
  if (rpId && rpId !== window.location.hostname) {
    passkeyDiag("registration_options_error", {
      message: "rp_mismatch",
      rpId,
    });
    return {
      data: null,
      error: new Error("Passkey RP ID does not match this host"),
    };
  }
  if (
    optionsUserName &&
    user.email &&
    optionsUserName.toLowerCase() !== user.email.toLowerCase()
  ) {
    passkeyDiag("registration_options_error", {
      message: "options_user_mismatch",
    });
    return {
      data: null,
      error: new Error("Passkey challenge does not belong to current user"),
    };
  }

  passkeyDiag("registration_options_ok", {
    challengePrefix: challengeId.slice(0, 8),
    rpId,
    userPrefix: user.id.slice(0, 8),
  });

  let credential: PublicKeyCredential;
  try {
    const publicKey = deserializeCreationOptions(
      started.data.options as unknown as Record<string, unknown>
    );
    const created = await navigator.credentials.create({ publicKey });
    if (!created || !(created instanceof PublicKeyCredential)) {
      passkeyDiag("credential_create_error", { reason: "empty_response" });
      return { data: null, error: new Error("Passkey create returned empty credential") };
    }
    credential = created;
  } catch (error) {
    passkeyDiag("credential_create_error", {
      name: error instanceof Error ? error.name : "unknown",
      // Safe: error name/short message only — never credential payload.
      message:
        error instanceof Error ? error.message.slice(0, 80) : "create_failed",
    });
    return { data: null, error: toError(error, "Passkey create failed") };
  }

  // Do not log credential id / rawId / attestation — only ceremony stage.
  passkeyDiag("credential_created", { type: credential.type });

  // Face ID UI can take long enough for the access token to near-expire.
  const afterCreateSession = await ensureFreshSession(supabase, user.id);
  if (!afterCreateSession.ok) {
    return { data: null, error: afterCreateSession.error };
  }

  const serialized = serializeCreationCredential(credential);
  passkeyDiag("registration_verify_started", {
    challengePrefix: challengeId.slice(0, 8),
  });

  let verifyResult = await supabase.auth.passkey.verifyRegistration({
    challengeId,
    credential: serialized as never,
  });

  // Retry only transient network failures. Same challenge_id — server will not
  // create a second credential if the first verify already consumed the challenge.
  if (verifyResult.error && isRetryablePasskeyNetworkError(verifyResult.error)) {
    passkeyDiag("registration_verify_error", {
      retry: true,
      message: verifyResult.error.message.slice(0, 80),
    });
    await ensureFreshSession(supabase, user.id);
    verifyResult = await supabase.auth.passkey.verifyRegistration({
      challengeId,
      credential: serialized as never,
    });
  }

  if (verifyResult.error || !verifyResult.data?.id) {
    const code = authErrorCode(verifyResult.error);
    passkeyDiag("registration_verify_error", {
      message: verifyResult.error?.message?.slice(0, 120) ?? "missing_data",
      code,
    });

    // Network ambiguity: verify may have persisted server-side even if the
    // client saw Load failed / challenge already used on retry.
    const afterFail = await listUserPasskeys();
    const createdDespiteError = afterFail.data.find((item) => !beforeIds.has(item.id));
    if (createdDespiteError) {
      passkeyDiag("registration_persist_ok", {
        listCount: afterFail.data.length,
        recovered: true,
      });
      return { data: createdDespiteError, error: null };
    }

    return {
      data: null,
      error: toError(
        verifyResult.error,
        "Passkey registration verify failed"
      ),
    };
  }

  passkeyDiag("registration_verify_ok", {
    passkeyPrefix: verifyResult.data.id.slice(0, 8),
  });

  // Success only when list confirms server persistence.
  const listed = await listUserPasskeys();
  const persisted =
    !listed.error &&
    listed.data.some((item) => item.id === verifyResult.data!.id);

  if (!persisted) {
    passkeyDiag("registration_persist_error", {
      listCount: listed.data.length,
      listError: listed.error?.message?.slice(0, 80) ?? null,
    });
    return {
      data: null,
      error: new Error(
        "Passkey verify returned success but credential was not persisted"
      ),
    };
  }

  passkeyDiag("registration_persist_ok", { listCount: listed.data.length });
  return {
    data: {
      id: verifyResult.data.id,
      friendly_name: verifyResult.data.friendly_name,
      created_at:
        typeof verifyResult.data.created_at === "string"
          ? verifyResult.data.created_at
          : new Date(verifyResult.data.created_at as unknown as string).toISOString(),
    },
    error: null,
  };
}

/** Sign in with an existing passkey (native Supabase Auth). Unchanged high-level API. */
export async function signInWithUserPasskey() {
  const supabase = createClient();
  return supabase.auth.signInWithPasskey();
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
