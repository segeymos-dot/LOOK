import { isPlatformAdmin } from "@/lib/data/finance-actions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await isPlatformAdmin(supabase, user.id);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { getSupabasePublicEnvFingerprint, getSupabaseServiceRoleKey } =
    await import("@/lib/supabase/env");
  const fingerprint = getSupabasePublicEnvFingerprint();

  return NextResponse.json({
    hasServiceRole: Boolean(getSupabaseServiceRoleKey()),
    hasDbUrl: Boolean(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL),
    hasAccessToken: Boolean(process.env.SUPABASE_ACCESS_TOKEN),
    supabaseUrlHost: fingerprint.urlHost,
    anonKeyKind: fingerprint.anonKeyKind,
    anonKeyLength: fingerprint.anonKeyLength,
  });
}
