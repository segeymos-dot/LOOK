import { getDemoPlatformSummary } from "@/lib/mock/finance";
import { isDemoMode } from "@/lib/config";
import { getPlatformSummary, isPlatformAdmin } from "@/lib/data/finance-actions";
import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (isDemoMode()) {
    return NextResponse.json({
      success: true,
      summary: getDemoPlatformSummary(),
    });
  }

  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const admin = await isPlatformAdmin(auth.supabase, auth.user.id);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Доступно только администратору платформы" },
      { status: 403 }
    );
  }

  const summary = await getPlatformSummary(auth.supabase);
  return NextResponse.json({ success: true, summary });
}
