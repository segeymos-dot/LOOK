import { requireAdminAuthContext } from "@/lib/auth/require-auth-context";
import {
  insertSupportReply,
  supportReplySchema,
} from "@/lib/support/messages";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAdminAuthContext(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { success: false, error: "Не указан идентификатор" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = supportReplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Введите текст ответа" },
      { status: 400 }
    );
  }

  const result = await insertSupportReply(auth.supabase, {
    ticketId: id,
    senderType: "admin",
    senderUserId: auth.user.id,
    message: parsed.data.message,
    language: parsed.data.language,
  });

  if (result.error === "not_found") {
    return NextResponse.json(
      { success: false, error: "Обращение не найдено" },
      { status: 404 }
    );
  }
  if (result.error === "closed") {
    return NextResponse.json(
      { success: false, error: "Обращение закрыто" },
      { status: 409 }
    );
  }
  if (result.error || !result.data) {
    return NextResponse.json(
      { success: false, error: result.error ?? "Не удалось отправить ответ" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    reply: result.data,
    message: result.ticket,
  });
}
