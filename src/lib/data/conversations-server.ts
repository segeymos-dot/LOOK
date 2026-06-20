import type { SupabaseClient } from "@supabase/supabase-js";
import type { Conversation, Message, Request } from "@/types";

type InboxRow = {
  conversation_id: string;
  last_content: string | null;
  last_created_at: string | null;
  last_sender_id: string | null;
  unread_count: number | string | null;
};

async function fetchInboxMeta(
  supabase: SupabaseClient,
  conversationIds: string[],
  userId: string
): Promise<Map<string, { lastMessage?: Message; unreadCount: number }>> {
  const meta = new Map<string, { lastMessage?: Message; unreadCount: number }>();

  const { data: inboxRows, error: inboxError } = await supabase.rpc(
    "get_conversation_inbox"
  );

  if (!inboxError && Array.isArray(inboxRows)) {
    for (const row of inboxRows as InboxRow[]) {
      if (!conversationIds.includes(row.conversation_id)) continue;
      meta.set(row.conversation_id, {
        lastMessage: row.last_content
          ? {
              id: "",
              conversation_id: row.conversation_id,
              sender_id: row.last_sender_id ?? "",
              content: row.last_content,
              read_at: null,
              created_at: row.last_created_at ?? new Date().toISOString(),
            }
          : undefined,
        unreadCount: Number(row.unread_count ?? 0),
      });
    }
    return meta;
  }

  const lastResults = await Promise.all(
    conversationIds.map(async (conversationId) => {
      const { data } = await supabase
        .from("messages")
        .select("id, conversation_id, content, created_at, sender_id, read_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return data as Message | null;
    })
  );

  const { data: unreadRows } = await supabase
    .from("messages")
    .select("conversation_id")
    .in("conversation_id", conversationIds)
    .neq("sender_id", userId)
    .is("read_at", null);

  const unreadCounts = new Map<string, number>();
  for (const row of unreadRows ?? []) {
    unreadCounts.set(
      row.conversation_id,
      (unreadCounts.get(row.conversation_id) ?? 0) + 1
    );
  }

  conversationIds.forEach((conversationId, index) => {
    const last = lastResults[index];
    meta.set(conversationId, {
      lastMessage: last ?? undefined,
      unreadCount: unreadCounts.get(conversationId) ?? 0,
    });
  });

  return meta;
}

export async function enrichConversations(
  supabase: SupabaseClient,
  conversations: Conversation[],
  userId: string
): Promise<Conversation[]> {
  if (conversations.length === 0) return conversations;

  const ids = conversations.map((c) => c.id);
  const meta = await fetchInboxMeta(supabase, ids, userId);

  return conversations
    .map((conversation) => {
      const info = meta.get(conversation.id);
      const last = info?.lastMessage;
      return {
        ...conversation,
        last_message: last,
        last_message_at: last?.created_at ?? conversation.last_message_at,
        unread_count: info?.unreadCount ?? 0,
      };
    })
    .sort((a, b) => {
      const aTime = new Date(a.last_message_at ?? a.created_at).getTime();
      const bTime = new Date(b.last_message_at ?? b.created_at).getTime();
      return bTime - aTime;
    });
}

export async function fetchUserConversations(
  supabase: SupabaseClient,
  userId: string
): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "*, customer:profiles!conversations_customer_id_fkey(*), provider:profiles!conversations_provider_id_fkey(*), request:requests(*)"
    )
    .or(`customer_id.eq.${userId},provider_id.eq.${userId}`)
    .order("last_message_at", { ascending: false });

  if (error) {
    console.error("fetchUserConversations:", error.message);
    return [];
  }

  return enrichConversations(supabase, (data ?? []) as Conversation[], userId);
}

export async function attachOffersCounts(
  supabase: SupabaseClient,
  requests: Request[]
): Promise<Request[]> {
  if (requests.length === 0) return requests;

  const ids = requests.map((r) => r.id);
  const { data: offers, error } = await supabase
    .from("offers")
    .select("request_id")
    .in("request_id", ids);

  if (error) {
    console.warn("attachOffersCounts:", error.message);
    return requests.map((request) => ({ ...request, offers_count: 0 }));
  }

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
