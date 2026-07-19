"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { ChatConversationList } from "@/components/chat/ChatConversationList";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/components/providers/LocaleProvider";
import type { Conversation } from "@/types";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

interface ChatListClientProps {
  conversations: Conversation[];
  currentUserId: string;
  loggedIn: boolean;
}

export function ChatListClient({ conversations, currentUserId, loggedIn }: ChatListClientProps) {
  const { t } = useTranslation();

  return (
    <AppLayout activePath="/chat" title={t("chat.title")}>
      <div className="p-4">
        <PageHeader title={t("chat.messages")} subtitle={t("chat.messagesSub")} />
      </div>
      {!loggedIn ? (
        <div className="p-4">
          <EmptyState
            icon={MessageCircle}
            title={t("chat.loginTitle")}
            description={t("chat.loginDesc")}
            action={
              <Link href="/login?redirect=/chat">
                <Button>{t("chat.loginBtn")}</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <ChatConversationList initialConversations={conversations} userId={currentUserId} />
      )}
    </AppLayout>
  );
}
