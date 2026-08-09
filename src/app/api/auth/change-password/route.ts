import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = rateLimit(`change-password:${ip}`, 8, 15 * 60 * 1000);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

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
      { success: false, error: "Email required" },
      { status: 400 }
    );
  }

  // Verify current password with a short-lived client (no cookie pollution).
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

  const { error } = await auth.supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
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
