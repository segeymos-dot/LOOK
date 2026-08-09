/**
 * Central Supabase env resolution for LOOK.
 *
 * - Trims whitespace / wrapping quotes (common Vercel paste mistakes → "Invalid API key").
 * - Accepts publishable (`sb_publishable_…`) or legacy JWT anon keys.
 * - Server code also checks non-NEXT_PUBLIC aliases so Preview runtime env can rotate
 *   without relying only on build-time inlined values.
 *
 * Keep the static NEXT_PUBLIC_* references below so Next.js still inlines them
 * into the browser bundle.
 */

// Static refs — required for Next.js client-bundle inlining of NEXT_PUBLIC_*.
const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function cleanEnv(value: string | undefined | null): string {
  if (!value) return "";
  let v = value.trim().replace(/^\uFEFF/, "");
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  // Reject values that still contain whitespace/newlines (broken multi-line paste).
  if (/\s/.test(v)) return "";
  return v;
}

function readDynamic(name: string): string {
  return cleanEnv(process.env[name]);
}

export type SupabaseKeyKind = "publishable" | "legacy_jwt" | "secret" | "other" | "missing";

export function classifySupabaseKey(key: string): SupabaseKeyKind {
  if (!key) return "missing";
  if (key.startsWith("sb_publishable_")) return "publishable";
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("eyJ")) return "legacy_jwt";
  return "other";
}

export function getSupabaseUrl(): string {
  return (
    readDynamic("SUPABASE_URL") ||
    cleanEnv(PUBLIC_SUPABASE_URL) ||
    readDynamic("NEXT_PUBLIC_SUPABASE_URL")
  );
}

/** Publishable or legacy anon key for browser / user-scoped clients. */
export function getSupabaseAnonKey(): string {
  return (
    readDynamic("SUPABASE_ANON_KEY") ||
    readDynamic("SUPABASE_PUBLISHABLE_KEY") ||
    cleanEnv(PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
    cleanEnv(PUBLIC_SUPABASE_ANON_KEY) ||
    readDynamic("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ||
    readDynamic("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}

/** Secret / service_role key for admin clients (server only). */
export function getSupabaseServiceRoleKey(): string {
  return (
    readDynamic("SUPABASE_SECRET_KEY") ||
    readDynamic("SUPABASE_SERVICE_ROLE_KEY")
  );
}

export function getSupabasePublicEnvFingerprint(): {
  urlHost: string | null;
  anonKeyKind: SupabaseKeyKind;
  anonKeyLength: number;
  hasServiceRole: boolean;
} {
  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  let urlHost: string | null = null;
  try {
    urlHost = url ? new URL(url).host : null;
  } catch {
    urlHost = null;
  }
  return {
    urlHost,
    anonKeyKind: classifySupabaseKey(anon),
    anonKeyLength: anon.length,
    hasServiceRole: Boolean(getSupabaseServiceRoleKey()),
  };
}
