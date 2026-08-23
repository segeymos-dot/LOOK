import type { SupabaseClient } from "@supabase/supabase-js";
import type { Message, WorkAttachment } from "@/types";

export function isMissingMessagesColumnError(error: {
  message?: string;
  code?: string;
}): boolean {
  const msg = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    msg.includes("attachment_urls") ||
    msg.includes("delivered_at")
  );
}

type InsertChatMessageInput = {
  conversation_id: string;
  sender_id: string;
  content: string;
  attachment_urls?: WorkAttachment[];
};

/** Inserts a chat message; falls back when migration 017 columns are not applied yet. */
export async function insertChatMessage(
  supabase: SupabaseClient,
  input: InsertChatMessageInput
): Promise<{ data: Message | null; error: Error | null }> {
  const withExtras = {
    conversation_id: input.conversation_id,
    sender_id: input.sender_id,
    content: input.content,
    attachment_urls: input.attachment_urls ?? [],
    delivered_at: new Date().toISOString(),
  };

  let result = await supabase
    .from("messages")
    .insert(withExtras)
    .select("*, sender:profiles(id, full_name, avatar_url)")
    .single();

  if (result.error && isMissingMessagesColumnError(result.error)) {
    result = await supabase
      .from("messages")
      .insert({
        conversation_id: input.conversation_id,
        sender_id: input.sender_id,
        content: input.content,
      })
      .select("*, sender:profiles(id, full_name, avatar_url)")
      .single();
  }

  if (result.error) {
    return { data: null, error: new Error(result.error.message) };
  }

  return { data: result.data as Message, error: null };
}
