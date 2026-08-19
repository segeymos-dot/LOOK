import { getFinanceApiUser } from "@/lib/api/finance-auth";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "@/lib/legal/versions";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  accepted: z.literal(true),
});

export async function POST(request: Request) {
  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Необходимо принять юридические документы" },
      { status: 400 }
    );
  }

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("id, is_platform_admin")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json(
      { success: false, error: "Профиль не найден" },
      { status: 404 }
    );
  }

  if (profile.is_platform_admin) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "platform_admin",
    });
  }

  const acceptedAt = new Date().toISOString();
  const { data: updated, error } = await auth.supabase
    .from("profiles")
    .update({
      terms_accepted_at: acceptedAt,
      terms_version: CURRENT_TERMS_VERSION,
      privacy_accepted_at: acceptedAt,
      privacy_version: CURRENT_PRIVACY_VERSION,
      updated_at: acceptedAt,
    })
    .eq("id", auth.user.id)
    .select(
      "terms_accepted_at, terms_version, privacy_accepted_at, privacy_version"
    )
    .single();

  if (error || !updated) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message ?? "Не удалось сохранить согласие",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    consent: updated,
  });
}
