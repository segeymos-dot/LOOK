"use client";

import { authFetch } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/config";
import { getMockMessages, mockCurrentUser } from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types";
import { useEffect, useState } from "react";

export function useMessages(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemoMode()) {
      setMessages(getMockMessages(conversationId));
      setLoading(false);
      return;
    }

    const fetchMessages = async () => {
      const response = await authFetch(
        `/api/conversations/${conversationId}/messages`
      );
      const result = (await response.json()) as { messages?: Message[] };
      setMessages(result.messages ?? []);
      setLoading(false);
    };

    fetchMessages();

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
          const result = (await response.json()) as { messages?: Message[] };
          const message = result.messages?.find((m) => m.id === payload.new.id);
          if (message) {
            setMessages((prev) =>
              prev.some((m) => m.id === message.id) ? prev : [...prev, message]
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const sendMessage = async (content: string, senderId: string) => {
    if (isDemoMode()) {
      const newMessage: Message = {
        id: `msg-${Date.now()}`,
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        read_at: null,
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
        body: JSON.stringify({ content }),
      }
    );

    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      return { error: { message: result.error ?? "Send failed" } };
    }

    const refresh = await authFetch(
      `/api/conversations/${conversationId}/messages`
    );
    const result = (await refresh.json()) as { messages?: Message[] };
    setMessages(result.messages ?? []);

    return { error: null };
  };

  return { messages, loading, sendMessage };
}
