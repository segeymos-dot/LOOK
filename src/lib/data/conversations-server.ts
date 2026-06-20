import type { SupabaseClient } from "@supabase/supabase-js";
import type { Conversation, Message, Request } from "@/types";

export async function enrichConversations(
  supabase: SupabaseClient,
  conversations: Conversation[],
  userId: string
): Promise<Conversation[]> {
  if (conversations.length === 0) return conversations;

  const ids = conversations.map((c) => c.id);
  const { data: messages } = await supabase
    .from("messages")
    .select("id, conversation_id, content, created_at, sender_id, read_at")
    .in("conversation_id", ids)
    .order("created_at", { ascending: false });

  const lastByConversation = new Map<string, Message>();
  const unreadByConversation = new Map<string, number>();

  for (const row of messages ?? []) {
    const message = row as Message;
    if (!lastByConversation.has(message.conversation_id)) {
      lastByConversation.set(message.conversation_id, message);
    }
    if (message.sender_id !== userId && !message.read_at) {
      unreadByConversation.set(
        message.conversation_id,
        (unreadByConversation.get(message.conversation_id) ?? 0) + 1
      );
    }
  }

  return conversations.map((conversation) => {
    const last = lastByConversation.get(conversation.id);
    return {
      ...conversation,
      last_message: last,
      last_message_at: last?.created_at ?? conversation.last_message_at,
      unread_count: unreadByConversation.get(conversation.id) ?? 0,
    };
  });
}

export async function attachOffersCounts(
  supabase: SupabaseClient,
  requests: Request[]
): Promise<Request[]> {
  if (requests.length === 0) return requests;

  const ids = requests.map((r) => r.id);
  const { data: offers } = await supabase
    .from("offers")
    .select("request_id")
    .in("request_id", ids);

  const counts = new Map<string, number>();
  for (const offer of offers ?? []) {
    counts.set(offer.request_id, (counts.get(offer.request_id) ?? 0) + 1);
  }

  return requests.map((request) => ({
    ...request,
    offers_count: counts.get(request.id) ?? 0,
  }));
}

export async function markConversationMessagesRead(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string
): Promise<void> {
  void userId;
  const { error } = await supabase.rpc("mark_conversation_read", {
    p_conversation_id: conversationId,
  });
  if (error && !error.message.includes("schema cache")) {
    console.warn("mark_conversation_read:", error.message);
  }
}
