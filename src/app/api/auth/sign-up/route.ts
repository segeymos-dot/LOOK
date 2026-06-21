import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { mapAuthError } from "@/lib/test-auth";
import { registerSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = rateLimit(`sign-up:${ip}`, 5, 60 * 60 * 1000);
  if (!limited.ok) {
    return rateLimitResponse(limited.retryAfterSec);
  }

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const origin =
    request.headers.get("origin")?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/`,
      data: {
        full_name: parsed.data.full_name,
        role: parsed.data.role,
        phone: parsed.data.phone || null,
        country: parsed.data.country || null,
        city: parsed.data.city || null,
        avatar_url: parsed.data.avatar_url || null,
        bio: parsed.data.bio || null,
        skills: parsed.data.skills || null,
        portfolio: parsed.data.portfolio || null,
        provider_category_slugs: parsed.data.provider_category_slugs ?? [],
      },
    },
  });

  if (error) {
    return NextResponse.json(
      { success: false, error: mapAuthError(error.message) },
      { status: 400 }
    );
  }

  if (data.session && data.user) {
    await supabase
      .from("profiles")
      .update({
        full_name: parsed.data.full_name,
        role: parsed.data.role,
        phone: parsed.data.phone || null,
        country: parsed.data.country || null,
        city: parsed.data.city || null,
        avatar_url: parsed.data.avatar_url || null,
        bio: parsed.data.bio || null,
        skills: parsed.data.skills || null,
        portfolio: parsed.data.portfolio || null,
        provider_category_slugs: parsed.data.provider_category_slugs ?? [],
      })
      .eq("id", data.user.id);
  }

  return NextResponse.json({
    success: true,
    user: data.user,
    session: data.session
      ? {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        }
      : null,
    email: parsed.data.email,
  });
}
