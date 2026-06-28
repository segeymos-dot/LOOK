import { isPlatformAdmin } from "@/lib/data/finance-actions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await isPlatformAdmin(supabase, user.id);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasDbUrl: Boolean(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL),
    hasAccessToken: Boolean(process.env.SUPABASE_ACCESS_TOKEN),
  });
}
