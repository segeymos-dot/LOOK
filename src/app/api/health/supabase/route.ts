import { getSupabasePublicEnvFingerprint } from "@/lib/supabase/env";
import { NextResponse } from "next/server";

/**
 * Safe fingerprint of Supabase public env (no secrets).
 * Preview-only: helps confirm URL host + key kind after env rotation / redeploy.
 */
export async function GET() {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const fingerprint = getSupabasePublicEnvFingerprint();
  return NextResponse.json({
    ok: Boolean(fingerprint.urlHost && fingerprint.anonKeyLength > 0),
    vercelEnv: vercelEnv ?? "local",
    ...fingerprint,
    hint:
      fingerprint.anonKeyKind === "legacy_jwt" && fingerprint.anonKeyLength > 300
        ? "anon key looks like a corrupted/oversized JWT paste — use LOOK Staging publishable key (sb_publishable_…), then Redeploy Preview"
        : fingerprint.anonKeyKind === "missing"
          ? "Missing anon/publishable key — set Preview NEXT_PUBLIC_SUPABASE_ANON_KEY from LOOK Staging, then Redeploy"
          : "After changing NEXT_PUBLIC_* on Vercel Preview, Redeploy is required for the browser bundle",
  });
}
