import { requireAdminAuthContext } from "@/lib/auth/require-auth-context";
import { listWebsiteInquiries } from "@/lib/admin/website-inquiries";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminAuthContext(request);
  if ("error" in auth) return auth.error;

  const result = await listWebsiteInquiries(auth.supabase);
  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { success: true, inquiries: result.inquiries },
    { headers: { "Cache-Control": "no-store" } }
  );
}
