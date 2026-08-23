import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  full_name: z.string().min(2).max(100),
  city: z.string().min(1).max(120),
  country: z.string().max(120).optional().nullable(),
  bio: z.string().min(10).max(2000),
  provider_category_slugs: z.array(z.string().min(1)).min(1),
  confirm: z.literal(true),
});

/**
 * Customer → both after short provider onboarding.
 * Does not change uiMode; caller may set local UI to provider after success.
 */
export async function POST(request: Request) {
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

  const { data: current, error: currentError } = await auth.supabase
    .from("profiles")
    .select("id, role")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (currentError || !current) {
    return NextResponse.json(
      { success: false, error: "Profile not found" },
      { status: 404 }
    );
  }

  if (current.role === "provider") {
    return NextResponse.json(
      {
        success: false,
        error: "Provider-only accounts cannot switch to dual mode via onboarding",
      },
      { status: 403 }
    );
  }

  if (current.role === "both") {
    return NextResponse.json(
      { success: false, error: "Already a provider" },
      { status: 400 }
    );
  }

  if (current.role !== "customer") {
    return NextResponse.json(
      { success: false, error: "Only customers can become providers" },
      { status: 403 }
    );
  }

  const patch = {
    full_name: parsed.data.full_name.trim(),
    city: parsed.data.city.trim(),
    country: parsed.data.country?.trim() || null,
    bio: parsed.data.bio.trim(),
    provider_category_slugs: parsed.data.provider_category_slugs,
    role: "both" as const,
    public_profile_visible: true,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await auth.supabase
    .from("profiles")
    .update(patch)
    .eq("id", auth.user.id)
    .select(
      `id, full_name, avatar_url, bio, role, city, country, phone, phone_verified,
       provider_category_slugs, availability_status, service_locations,
       public_profile_visible, default_location, payout_details_note,
       notification_preferences, privacy_preferences`
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }

  await auth.supabase.auth.updateUser({
    data: {
      full_name: patch.full_name,
      role: "both",
    },
  });

  return NextResponse.json({ success: true, profile: data });
}
