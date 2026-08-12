import { performPasswordSignIn } from "@/lib/auth/perform-password-sign-in";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { mapAuthError } from "@/lib/test-auth";
import { loginSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = rateLimit(`sign-in:${ip}`, 10, 15 * 60 * 1000);
  if (!limited.ok) {
    return rateLimitResponse(limited.retryAfterSec);
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const result = await performPasswordSignIn(supabase, {
    email: parsed.data.email,
    password: parsed.data.password,
    request,
    ip,
  });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: mapAuthError(result.errorMessage) },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    user: result.user,
    session: {
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    },
  });
}
