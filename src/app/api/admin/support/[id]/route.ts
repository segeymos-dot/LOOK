import { requireAdminAuthContext } from "@/lib/auth/require-auth-context";
import {
  getSupportTicketDetail,
  markSupportTicketRead,
  updateSupportMessageStatus,
} from "@/lib/support/messages";
import { isAdminSupportStatus } from "@/lib/support/types";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAdminAuthContext(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { success: false, error: "Не указан идентификатор" },
      { status: 400 }
    );
  }

  const marked = await markSupportTicketRead(auth.supabase, id);
  if (marked.error) {
    // Fallback: status new→read if RPC missing
    const detail = await getSupportTicketDetail(auth.supabase, id, {
      viewer: "admin",
      includeEmail: true,
    });
    if (detail.error) {
      return NextResponse.json(
        { success: false, error: detail.error },
        { status: 500 }
      );
    }
    if (!detail.data) {
      return NextResponse.json(
        { success: false, error: "Обращение не найдено" },
        { status: 404 }
      );
    }
    let message = detail.data;
    if (message.status === "new") {
      const updated = await updateSupportMessageStatus(
        auth.supabase,
        id,
        "read"
      );
      if (updated.data) {
        message = { ...message, ...updated.data };
      }
    }
    return NextResponse.json({ success: true, message });
  }

  const result = await getSupportTicketDetail(auth.supabase, id, {
    viewer: "admin",
    includeEmail: true,
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

  return NextResponse.json({
    success: true,
    message: {
      ...result.data,
      ...(marked.data ?? {}),
    },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdminAuthContext(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const status = typeof body?.status === "string" ? body.status : "";
  if (!isAdminSupportStatus(status)) {
    return NextResponse.json(
      { success: false, error: "Некорректный статус" },
      { status: 400 }
    );
  }

  const updated = await updateSupportMessageStatus(auth.supabase, id, status);
  if (updated.error || !updated.data) {
    return NextResponse.json(
      { success: false, error: updated.error ?? "Не удалось обновить статус" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, message: updated.data });
}
