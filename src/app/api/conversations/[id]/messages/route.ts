import { markConversationMessagesRead } from "@/lib/data/conversations-server";
import { insertChatMessage } from "@/lib/data/chat-message-insert";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import { messageSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const accessToken = request.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!accessToken) {
    return NextResponse.json({ messages: [] }, { status: 401 });
  }

  const supabase = createAuthenticatedClient(accessToken);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ messages: [] }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("messages")
    .select("*, sender:profiles(id, full_name, avatar_url)")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await markConversationMessagesRead(supabase, id, user.id);

  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const accessToken = request.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAuthenticatedClient(accessToken);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimit(`messages:${user.id}`, 30, 60_000);
  if (!limited.ok) {
    return rateLimitResponse(limited.retryAfterSec);
  }

  const body = (await request.json()) as {
    content?: string;
    attachment_urls?: { name: string; url: string; type: string }[];
  };
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid message" },
      { status: 400 }
    );
  }

  const hasContent = parsed.data.content.trim().length > 0;
  const attachments = parsed.data.attachment_urls ?? [];
  if (!hasContent && attachments.length === 0) {
    return NextResponse.json({ error: "Сообщение не может быть пустым" }, { status: 400 });
  }

  const ipLimited = rateLimit(`messages-ip:${getClientIp(request)}`, 60, 60_000);
  if (!ipLimited.ok) {
    return rateLimitResponse(ipLimited.retryAfterSec);
  }

  const { data: message, error } = await insertChatMessage(supabase, {
    conversation_id: id,
    sender_id: user.id,
    content: parsed.data.content,
    attachment_urls: attachments,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message });
}
