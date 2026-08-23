import { listSecurityEvents } from "@/lib/auth/account-sessions";
import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const events = await listSecurityEvents(auth.supabase, auth.user.id, 25);
  return NextResponse.json({ success: true, events });
}
