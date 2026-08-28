import { requireAuthContext } from "@/lib/auth/require-auth-context";
import {
  canActAsCustomer,
  canActAsProvider,
} from "@/lib/auth/roles";
import {
  createSupportMessageSchema,
  insertSupportMessage,
  listSupportTicketsForUser,
} from "@/lib/support/messages";
import type { UserRole } from "@/types";
import { NextResponse } from "next/server";

function resolveRole(
  profileRole: UserRole | null | undefined,
  requested: "customer" | "provider"
): "customer" | "provider" | null {
  if (requested === "customer" && canActAsCustomer(profileRole ?? "customer")) {
    return "customer";
  }
  if (requested === "provider" && canActAsProvider(profileRole ?? "provider")) {
    return "provider";
  }
  if (canActAsCustomer(profileRole ?? "customer")) return "customer";
  if (canActAsProvider(profileRole ?? "provider")) return "provider";
  return null;
}

export async function GET(request: Request) {
  const auth = await requireAuthContext(request);
  if ("error" in auth) return auth.error;

  const result = await listSupportTicketsForUser(auth.supabase, auth.user.id);
  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, messages: result.data });
}

export async function POST(request: Request) {
  const auth = await requireAuthContext(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = createSupportMessageSchema.safeParse(body);
  if (!parsed.success) {
    const code = parsed.error.errors[0]?.message ?? "invalid";
    const message =
      code === "message_required" || code === "Too small"
        ? "Введите текст сообщения"
        : code === "subject_required"
          ? "Укажите тему"
          : "Проверьте заполнение формы";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();

  const userRole = resolveRole(
    (profile?.role as UserRole | undefined) ?? "customer",
    parsed.data.userRole
  );
  if (!userRole) {
    return NextResponse.json(
      { success: false, error: "Не удалось определить роль пользователя" },
      { status: 400 }
    );
  }

  const result = await insertSupportMessage(auth.supabase, {
    userId: auth.user.id,
    userRole,
    subject: parsed.data.subject,
    message: parsed.data.message,
    language: parsed.data.language,
    idempotencyKey: parsed.data.idempotencyKey,
  });

  if (result.error || !result.data) {
    return NextResponse.json(
      {
        success: false,
        error: result.error ?? "Не удалось отправить обращение",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, message: result.data });
}
