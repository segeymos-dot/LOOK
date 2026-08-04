import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  notification_preferences: z
    .object({
      orderUpdates: z.boolean().optional(),
      messages: z.boolean().optional(),
      marketing: z.boolean().optional(),
      disputeUpdates: z.boolean().optional(),
    })
    .optional(),
  privacy_preferences: z
    .object({
      showCity: z.boolean().optional(),
      showPhoneToClients: z.boolean().optional(),
    })
    .optional(),
  public_profile_visible: z.boolean().optional(),
  availability_status: z
    .enum(["available", "busy", "away", "offline"])
    .optional(),
  service_locations: z.array(z.string()).optional(),
  default_location: z.string().max(200).nullable().optional(),
  payout_details_note: z.string().max(500).nullable().optional(),
  bio: z.string().max(2000).nullable().optional(),
  provider_category_slugs: z.array(z.string()).optional(),
  full_name: z.string().min(2).max(100).optional(),
  city: z.string().max(120).nullable().optional(),
  country: z.string().max(120).nullable().optional(),
  role: z.enum(["customer", "provider", "both"]).optional(),
  phone: z.string().max(40).nullable().optional(),
});

export async function GET(request: Request) {
  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("profiles")
    .select(
      `id, full_name, avatar_url, bio, role, city, country, phone, phone_verified,
       provider_category_slugs, availability_status, service_locations,
       public_profile_visible, default_location, payout_details_note,
       notification_preferences, privacy_preferences`
    )
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    profile: data,
    email: auth.user.email ?? null,
    emailVerified: Boolean(auth.user.email_confirmed_at),
  });
}

export async function PATCH(request: Request) {
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

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) patch[key] = value;
  }

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

  if (parsed.data.full_name || parsed.data.role) {
    await auth.supabase.auth.updateUser({
      data: {
        ...(parsed.data.full_name ? { full_name: parsed.data.full_name } : {}),
        ...(parsed.data.role ? { role: parsed.data.role } : {}),
      },
    });
  }

  return NextResponse.json({ success: true, profile: data });
}
