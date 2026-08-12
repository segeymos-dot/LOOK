import { createClient } from "@/lib/supabase/client";

/** Mirrors Supabase Auth `PasskeyListItem` (auth-js 2.108.1). */
export type PasskeyListItem = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

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

export function passkeyErrorCode(error: unknown): "unsupported" | "cancelled" | "failed" {
  if (!isPasskeySupported()) return "unsupported";
  if (isUserCancellation(error)) return "cancelled";
  return "failed";
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

export async function listUserPasskeys() {
  const supabase = createClient();
  return supabase.auth.passkey.list();
}

export async function renameUserPasskey(passkeyId: string, friendlyName: string) {
  const supabase = createClient();
  return supabase.auth.passkey.update({
    passkeyId,
    friendlyName: friendlyName.trim().slice(0, 120),
  });
}

export async function deleteUserPasskey(passkeyId: string) {
  const supabase = createClient();
  return supabase.auth.passkey.delete({ passkeyId });
}
