import { requireAdminAuthContext } from "@/lib/auth/require-auth-context";
import { countAdminSupportUnreadMessages } from "@/lib/support/messages";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminAuthContext(request);
  if ("error" in auth) return auth.error;

  const result = await countAdminSupportUnreadMessages(auth.supabase);
  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { success: true, unread_messages: result.count },
    { headers: { "Cache-Control": "no-store" } }
  );
}
