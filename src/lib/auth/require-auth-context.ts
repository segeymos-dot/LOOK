import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/data/finance-actions";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export type AuthContext =
  | { user: User; supabase: SupabaseClient }
  | { error: NextResponse };

/** Prefer Bearer (authFetch); fall back to cookie session. */
export async function requireAuthContext(
  request: Request
): Promise<AuthContext> {
  const accessToken = request.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "");

  let supabase: SupabaseClient;
  if (accessToken) {
    supabase = createAuthenticatedClient(accessToken);
  } else {
    supabase = await createClient();
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: NextResponse.json(
        { success: false, error: "Необходима авторизация" },
        { status: 401 }
      ),
    };
  }

  return { user, supabase };
}

export async function requireAdminAuthContext(
  request: Request
): Promise<AuthContext> {
  const auth = await requireAuthContext(request);
  if ("error" in auth) return auth;

  const admin = await isPlatformAdmin(auth.supabase, auth.user.id);
  if (!admin) {
    return {
      error: NextResponse.json(
        { success: false, error: "Недостаточно прав" },
        { status: 403 }
      ),
    };
  }

  return auth;
}
