"use client";

import { Avatar } from "@/components/ui/Avatar";
import { DemoBanner } from "@/components/layout/DemoBanner";
import { MessageInput } from "@/components/chat/MessageInput";
import { MessageList } from "@/components/chat/MessageList";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { authFetch } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/config";
import { getMockConversation } from "@/lib/mock/data";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";

export default function ChatDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { messages, loading, sendMessage } = useMessages(id);
  const [otherUserName, setOtherUserName] = useState("");
  const [otherUserAvatar, setOtherUserAvatar] = useState<string | null>(null);
  const [requestTitle, setRequestTitle] = useState("");

  useEffect(() => {
    if (isDemoMode()) {
      const data = getMockConversation(id);
      if (data && user) {
        const other =
          data.customer_id === user.id ? data.provider : data.customer;
        setOtherUserName(other?.full_name ?? "");
        setOtherUserAvatar(other?.avatar_url ?? null);
        setRequestTitle(data.request?.title ?? "");
      }
      return;
    }

    const fetchConversation = async () => {
      const response = await authFetch(`/api/conversations/${id}`);
      if (!response.ok) return;

      const { conversation: data } = (await response.json()) as {
        conversation?: {
          customer_id: string;
          provider?: { full_name: string; avatar_url?: string | null };
          customer?: { full_name: string; avatar_url?: string | null };
          request?: { title: string };
        };
      };

      if (data && user) {
        const other =
          data.customer_id === user.id ? data.provider : data.customer;
        setOtherUserName(other?.full_name ?? "");
        setOtherUserAvatar(other?.avatar_url ?? null);
        setRequestTitle(data.request?.title ?? "");
      }
    };

    if (user) fetchConversation();
  }, [id, user]);

  const handleSend = async (content: string) => {
    if (!user) return;
    await sendMessage(content, user.id);
  };

  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col bg-surface-muted">
      <header className="glass-header border-b border-border-subtle pt-safe">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            href="/chat"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-text-secondary shadow-card hover:bg-brand-50 hover:text-brand-600"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <Avatar src={otherUserAvatar} name={otherUserName || "?"} size="md" ring />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-text-primary">{otherUserName}</p>
            {requestTitle && (
              <p className="truncate text-xs text-brand-600">{requestTitle}</p>
            )}
          </div>
        </div>
        <DemoBanner />
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
        </div>
      ) : (
        <MessageList messages={messages} currentUserId={user?.id ?? ""} />
      )}

      <MessageInput onSend={handleSend} disabled={!user} />
    </div>
  );
}
