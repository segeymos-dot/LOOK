import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export async function getFinanceApiUser(
  request: Request
): Promise<{ supabase: SupabaseClient; user: User } | { error: Response }> {
  const accessToken = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");

  if (!accessToken) {
    return {
      error: Response.json(
        { success: false, error: "Необходима авторизация" },
        { status: 401 }
      ),
    };
  }

  const supabase = createAuthenticatedClient(accessToken);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: Response.json(
        { success: false, error: "Необходима авторизация" },
        { status: 401 }
      ),
    };
  }

  return { supabase, user };
}
