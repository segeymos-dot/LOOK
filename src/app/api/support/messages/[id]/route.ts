import { requireAuthContext } from "@/lib/auth/require-auth-context";
import {
  getSupportTicketDetail,
  markSupportTicketRead,
} from "@/lib/support/messages";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function noStore(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthContext(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!id) {
    return noStore(
      { success: false, error: "Не указан идентификатор" },
      { status: 400 }
    );
  }

  // Load thread first so a mark-read failure never blocks message history.
  const result = await getSupportTicketDetail(auth.supabase, id, {
    viewer: "user",
    userId: auth.user.id,
  });

  if (result.error) {
    return noStore({ success: false, error: result.error }, { status: 500 });
  }
  if (!result.data) {
    return noStore(
      { success: false, error: "Обращение не найдено" },
      { status: 404 }
    );
  }

  void markSupportTicketRead(auth.supabase, id).catch(() => undefined);

  // Expose thread at top-level AND inside message so clients cannot miss it
  // when they only read one shape (legacy vs detail).
  return noStore({
    success: true,
    message: result.data,
    thread: result.data.thread,
  });
}
