import { requireAuthContext } from "@/lib/auth/require-auth-context";
import {
  getSupportTicketDetail,
  markSupportTicketRead,
} from "@/lib/support/messages";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthContext(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { success: false, error: "Не указан идентификатор" },
      { status: 400 }
    );
  }

  await markSupportTicketRead(auth.supabase, id);

  const result = await getSupportTicketDetail(auth.supabase, id, {
    viewer: "user",
    userId: auth.user.id,
  });

  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500 }
    );
  }
  if (!result.data) {
    return NextResponse.json(
      { success: false, error: "Обращение не найдено" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, message: result.data });
}
