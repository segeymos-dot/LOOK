import { isPlatformAdmin } from "@/lib/data/finance-actions";
import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AdminContext = {
  user: User;
  supabase: SupabaseClient;
  /** Service-role client for auth.users email lookup + admin directory reads. Null if unset. */
  adminClient: SupabaseClient | null;
};

export async function requireAdminContext(
  request?: Request
): Promise<
  | { ok: true; ctx: AdminContext }
  | { ok: false; status: 401 | 403; error: string }
> {
  let supabase: SupabaseClient;
  let user: User | null = null;

  const accessToken = request?.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (accessToken) {
    supabase = createAuthenticatedClient(accessToken);
    const {
      data: { user: bearerUser },
    } = await supabase.auth.getUser();
    user = bearerUser;
  } else {
    supabase = await createClient();
    const {
      data: { user: cookieUser },
    } = await supabase.auth.getUser();
    user = cookieUser;
  }

  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const admin = await isPlatformAdmin(supabase, user.id);
  if (!admin) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return {
    ok: true,
    ctx: {
      user,
      supabase,
      adminClient: createAdminClient(),
    },
  };
}
