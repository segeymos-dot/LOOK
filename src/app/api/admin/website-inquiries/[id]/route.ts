import { requireAdminAuthContext } from "@/lib/auth/require-auth-context";
import {
  getWebsiteInquiry,
  listWebsiteInquiryReplies,
  markWebsiteInquiryRead,
} from "@/lib/admin/website-inquiries";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAdminAuthContext(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { success: false, error: "Missing id" },
      { status: 400 }
    );
  }

  const markRead =
    new URL(request.url).searchParams.get("mark_read") !== "false";

  const result = markRead
    ? await markWebsiteInquiryRead(auth.supabase, id)
    : await getWebsiteInquiry(auth.supabase, id);

  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!result.inquiry) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const replies = await listWebsiteInquiryReplies(auth.supabase, id);

  return NextResponse.json(
    {
      success: true,
      inquiry: result.inquiry,
      replies: replies.replies,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
