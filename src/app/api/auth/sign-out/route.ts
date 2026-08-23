import {
  revokeAllAccountSessions,
} from "@/lib/auth/account-sessions";
import { decodeAccessTokenClaims } from "@/lib/auth/session-meta";
import { getClientIp } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    scope?: "local" | "global";
  };
  const scope = body.scope === "global" ? "global" : "local";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authHeader = request.headers.get("Authorization");
  const accessToken = authHeader?.replace(/^Bearer\s+/i, "") ?? null;
  const claims = decodeAccessTokenClaims(accessToken);
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent");

  if (user) {
    try {
      await supabase.rpc("log_account_security_event", {
        p_user_id: user.id,
        p_event_type: scope === "global" ? "sign_out_all_devices" : "sign_out",
        p_metadata: { scope },
        p_ip: ip,
        p_user_agent: userAgent,
      });
    } catch {
      // best-effort
    }

    if (scope === "global") {
      await revokeAllAccountSessions(supabase, user.id, null, {
        includeCurrent: true,
      });
      const admin = createAdminClient();
      if (admin && accessToken) {
        try {
          // Admin signOut expects the user's JWT, not the user id.
          await admin.auth.admin.signOut(accessToken, "global");
        } catch {
          // best-effort — client also calls auth.signOut({ scope: "global" })
        }
      }
    } else if (claims?.session_id) {
      try {
        await supabase.rpc("revoke_user_session", {
          p_user_id: user.id,
          p_auth_session_id: claims.session_id,
        });
      } catch {
        // best-effort
      }
    }
  }

  // Clear SSR auth cookies for this device.
  await supabase.auth.signOut({ scope: "local" });

  return NextResponse.json({ success: true, scope });
}
