import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(8).max(128),
});

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/**
 * Update the authenticated user's password via GoTrue REST.
 *
 * createAuthenticatedClient only attaches Authorization — it does not install a
 * local auth-js session. supabase.auth.updateUser() requires that session and
 * otherwise throws AuthSessionMissingError, so password never changes.
 * PUT /auth/v1/user with the caller's JWT is the correct path.
 */
async function updatePasswordWithAccessToken(
  accessToken: string,
  newPassword: string
): Promise<{ ok: true } | { ok: false; message: string; status: number }> {
  const res = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: getSupabaseAnonKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: newPassword }),
  });

  if (res.ok) return { ok: true };

  let message = "Failed to update password";
  try {
    const json = (await res.json()) as { msg?: string; error_description?: string; error?: string };
    message = json.msg || json.error_description || json.error || message;
  } catch {
    /* keep default */
  }
  return { ok: false, message, status: res.status >= 400 && res.status < 600 ? res.status : 400 };
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = rateLimit(`change-password:${ip}`, 8, 15 * 60 * 1000);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const email = auth.user.email;
  if (!email) {
    return NextResponse.json(
      { success: false, error: "Account email required" },
      { status: 400 }
    );
  }

  // Verify current password without mutating the caller's browser session.
  // Ephemeral verifier client — sign-in here only validates credentials.
  const verifier = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) {
    return NextResponse.json(
      { success: false, error: "Invalid current password" },
      { status: 401 }
    );
  }
  // Drop verifier session locally (no cookies were written).
  await verifier.auth.signOut({ scope: "local" }).catch(() => undefined);

  const updated = await updatePasswordWithAccessToken(
    accessToken,
    parsed.data.newPassword
  );
  if (!updated.ok) {
    return NextResponse.json(
      { success: false, error: updated.message },
      { status: updated.status }
    );
  }

  await auth.supabase.rpc("log_account_security_event", {
    p_user_id: auth.user.id,
    p_event_type: "password_changed",
    p_metadata: {},
    p_ip: ip,
    p_user_agent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ success: true });
}
