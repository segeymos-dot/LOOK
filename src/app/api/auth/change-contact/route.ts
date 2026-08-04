import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  currentPassword: z.string().min(6),
  email: z.string().email().optional(),
  phone: z.string().min(5).max(40).optional(),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = rateLimit(`change-contact:${ip}`, 8, 15 * 60 * 1000);
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

  if (!parsed.data.email && !parsed.data.phone) {
    return NextResponse.json(
      { success: false, error: "email or phone required" },
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

  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
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

  if (parsed.data.email && parsed.data.email !== email) {
    const { error } = await auth.supabase.auth.updateUser({
      email: parsed.data.email,
    });
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    await auth.supabase.rpc("log_account_security_event", {
      p_user_id: auth.user.id,
      p_event_type: "email_change_requested",
      p_metadata: { new_email: parsed.data.email },
      p_ip: ip,
      p_user_agent: request.headers.get("user-agent"),
    });
  }

  if (parsed.data.phone) {
    const { error: profileError } = await auth.supabase
      .from("profiles")
      .update({
        phone: parsed.data.phone,
        phone_verified: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auth.user.id);
    if (profileError) {
      return NextResponse.json(
        { success: false, error: profileError.message },
        { status: 400 }
      );
    }
    await auth.supabase.rpc("log_account_security_event", {
      p_user_id: auth.user.id,
      p_event_type: "phone_changed",
      p_metadata: {},
      p_ip: ip,
      p_user_agent: request.headers.get("user-agent"),
    });
  }

  return NextResponse.json({
    success: true,
    emailPendingConfirmation: Boolean(
      parsed.data.email && parsed.data.email !== email
    ),
  });
}
