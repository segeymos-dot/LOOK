"use client";

import { authFetch } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/config";
import { getMockMessages, mockCurrentUser } from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types";
import { useCallback, useEffect, useState } from "react";

function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const message of prev) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

export function useMessages(conversationId: string, userId?: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendError, setSendError] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    if (isDemoMode()) {
      setMessages(getMockMessages(conversationId));
      setLoading(false);
      return;
    }

    if (!userId) {
      setMessages([]);
      setLoading(true);
      return;
    }

    setLoading(true);
    const response = await authFetch(`/api/conversations/${conversationId}/messages`);
    if (response.ok) {
      const result = (await response.json()) as { messages?: Message[] };
      setMessages(result.messages ?? []);
    }
    setLoading(false);
  }, [conversationId, userId]);

  useEffect(() => {
    if (isDemoMode()) {
      setMessages(getMockMessages(conversationId));
      setLoading(false);
      return;
    }

    if (!userId) {
      setMessages([]);
      setLoading(true);
      return;
    }

    void fetchMessages();

    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const response = await authFetch(
            `/api/conversations/${conversationId}/messages`
          );
          if (!response.ok) return;
          const result = (await response.json()) as { messages?: Message[] };
          const message = result.messages?.find((m) => m.id === payload.new.id);
          if (message) {
            setMessages((prev) => mergeMessages(prev, [message]));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, userId, fetchMessages]);

  const sendMessage = async (
    content: string,
    senderId: string,
    attachmentUrls: Message["attachment_urls"] = []
  ) => {
    setSendError(null);

    if (isDemoMode()) {
      const newMessage: Message = {
        id: `msg-${Date.now()}`,
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        read_at: null,
        delivered_at: new Date().toISOString(),
        attachment_urls: attachmentUrls ?? [],
        created_at: new Date().toISOString(),
        sender: mockCurrentUser,
      };
      setMessages((prev) => [...prev, newMessage]);
      return { error: null };
    }

    const response = await authFetch(
      `/api/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, attachment_urls: attachmentUrls }),
      }
    );

    const result = (await response.json()) as {
      error?: string;
      message?: Message;
      messages?: Message[];
    };

    if (!response.ok) {
      const message = result.error ?? "Send failed";
      setSendError(message);
      return { error: { message } };
    }

    if (result.message) {
      setMessages((prev) => mergeMessages(prev, [result.message!]));
      return { error: null };
    }

    if (result.messages) {
      setMessages(result.messages);
      return { error: null };
    }

    const refresh = await authFetch(`/api/conversations/${conversationId}/messages`);
    if (refresh.ok) {
      const refreshed = (await refresh.json()) as { messages?: Message[] };
      setMessages(refreshed.messages ?? []);
    }

    return { error: null };
  };

  return { messages, loading, sendMessage, sendError, clearSendError: () => setSendError(null) };
}
