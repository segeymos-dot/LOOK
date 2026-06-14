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

export default function ChatDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { messages, loading, sendMessage } = useMessages(id);
  const [otherUserName, setOtherUserName] = useState("");
  const [requestTitle, setRequestTitle] = useState("");

  useEffect(() => {
    if (isDemoMode()) {
      const data = getMockConversation(id);
      if (data && user) {
        const other =
          data.customer_id === user.id ? data.provider : data.customer;
        setOtherUserName(other?.full_name ?? "");
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
          provider?: { full_name: string };
          customer?: { full_name: string };
          request?: { title: string };
        };
      };

      if (data && user) {
        const other =
          data.customer_id === user.id ? data.provider : data.customer;
        setOtherUserName(other?.full_name ?? "");
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
    <div className="mx-auto flex h-dvh max-w-lg flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/chat" className="text-indigo-600">
            ←
          </Link>
          <Avatar name={otherUserName || "?"} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">{otherUserName}</p>
            {requestTitle && (
              <p className="truncate text-xs text-gray-500">{requestTitle}</p>
            )}
          </div>
        </div>
        <DemoBanner />
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-gray-400">Загрузка...</p>
        </div>
      ) : (
        <MessageList messages={messages} currentUserId={user?.id ?? ""} />
      )}

      <MessageInput onSend={handleSend} disabled={!user} />
    </div>
  );
}
