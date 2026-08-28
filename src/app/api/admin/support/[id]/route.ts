import { requireAdminAuthContext } from "@/lib/auth/require-auth-context";
import {
  getSupportTicketDetail,
  markSupportTicketRead,
  updateSupportMessageStatus,
} from "@/lib/support/messages";
import { isAdminSupportStatus } from "@/lib/support/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function noStore(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAdminAuthContext(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!id) {
    return noStore(
      { success: false, error: "Не указан идентификатор" },
      { status: 400 }
    );
  }

  // Thread history first — mark-read must never block or empty the conversation.
  const result = await getSupportTicketDetail(auth.supabase, id, {
    viewer: "admin",
    includeEmail: true,
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

  void markSupportTicketRead(auth.supabase, id)
    .then(async (marked) => {
      if (marked.error && result.data?.status === "new") {
        await updateSupportMessageStatus(auth.supabase, id, "read");
      }
    })
    .catch(() => undefined);

  return noStore({ success: true, message: result.data });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdminAuthContext(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const status = typeof body?.status === "string" ? body.status : "";
  if (!isAdminSupportStatus(status)) {
    return noStore(
      { success: false, error: "Некорректный статус" },
      { status: 400 }
    );
  }

  const updated = await updateSupportMessageStatus(auth.supabase, id, status);
  if (updated.error || !updated.data) {
    return noStore(
      { success: false, error: updated.error ?? "Не удалось обновить статус" },
      { status: 500 }
    );
  }

  return noStore({ success: true, message: updated.data });
}
