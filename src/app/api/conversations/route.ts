import { fetchUserConversations } from "@/lib/data/conversations-server";
import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const conversations = await fetchUserConversations(auth.supabase, auth.user.id);

  return NextResponse.json({
    success: true,
    conversations,
  });
}
