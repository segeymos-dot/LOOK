import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Cookie durability probe for password login.
 * Reads the SSR auth cookie via getUser() — no tokens in the response body.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      { success: false, user: null, is_platform_admin: false },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    success: true,
    user: { id: user.id },
    is_platform_admin: Boolean(profile?.is_platform_admin),
  });
}
