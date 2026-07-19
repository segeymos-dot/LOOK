import { getAuthEmailRedirectTo } from "@/lib/app-url";
import { mapAuthError } from "@/lib/test-auth";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const supabase = await createClient();
  const emailRedirectTo = getAuthEmailRedirectTo("signup");
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo },
  });

  if (error) {
    return NextResponse.json(
      { error: mapAuthError(error.message) },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, emailRedirectTo });
}
