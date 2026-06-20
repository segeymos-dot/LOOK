"use client";

import { ConversationItem } from "@/components/chat/ConversationItem";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { isDemoMode } from "@/lib/config";
import type { Conversation } from "@/types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";

interface ChatConversationListProps {
  initialConversations: Conversation[];
  userId: string;
}

export function ChatConversationList({
  initialConversations,
  userId,
}: ChatConversationListProps) {
  const { user, ready } = useAuth();
  const [conversations, setConversations] = useState(initialConversations);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setConversations(initialConversations);
  }, [initialConversations]);

  useEffect(() => {
    if (isDemoMode()) return;
    if (initialConversations.length > 0) return;
    if (!ready || !user) return;

    let active = true;
    setLoading(true);

    void authFetch("/api/conversations")
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((data) => {
        if (!active || !data?.conversations?.length) return;
        setConversations(data.conversations as Conversation[]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [initialConversations.length, ready, user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  if (conversations.length > 0) {
    return (
      <div className="bg-surface">
        {conversations.map((conversation) => (
          <ConversationItem
            key={conversation.id}
            conversation={conversation}
            currentUserId={userId}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4">
      <EmptyState
        icon={MessageCircle}
        title="Нет активных чатов"
        description="Чат появится после принятия предложения или первого сообщения"
        action={
          <Link href="/search">
            <Button variant="secondary" size="sm">
              Найти заказы
            </Button>
          </Link>
        }
      />
    </div>
  );
}
