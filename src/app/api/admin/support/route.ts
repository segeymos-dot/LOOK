import { requireAdminAuthContext } from "@/lib/auth/require-auth-context";
import { listSupportMessagesForAdmin } from "@/lib/support/messages";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requireAdminAuthContext(request);
  if ("error" in auth) return auth.error;

  const result = await listSupportMessagesForAdmin(auth.supabase);
  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, messages: result.data });
}
