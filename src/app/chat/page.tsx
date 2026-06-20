import { AppLayout } from "@/components/layout/AppLayout";
import { ChatConversationList } from "@/components/chat/ChatConversationList";
import { ConversationItem } from "@/components/chat/ConversationItem";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { isDemoMode } from "@/lib/config";
import { mockConversations, mockCurrentUser } from "@/lib/mock/data";
import { fetchUserConversations } from "@/lib/data/conversations-server";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

export default async function ChatListPage() {
  if (isDemoMode()) {
    const user = mockCurrentUser;

    return (
      <AppLayout activePath="/chat" title="Чаты">
        <div className="p-4">
          <PageHeader title="Сообщения" subtitle="Переписка с заказчиками и исполнителями" />
        </div>
        <div className="bg-surface">
          {mockConversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              currentUserId={user.id}
            />
          ))}
        </div>
      </AppLayout>
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppLayout activePath="/chat" title="Чаты">
        <div className="p-4">
          <EmptyState
            icon={MessageCircle}
            title="Войдите, чтобы видеть чаты"
            description="После принятия предложения откроется переписка"
            action={
              <Link href="/login?redirect=/chat">
                <Button>Войти</Button>
              </Link>
            }
          />
        </div>
      </AppLayout>
    );
  }

  const conversations = await fetchUserConversations(supabase, user.id);

  return (
    <AppLayout activePath="/chat" title="Чаты">
      <div className="p-4">
        <PageHeader title="Сообщения" subtitle="Переписка с заказчиками и исполнителями" />
      </div>

      <ChatConversationList initialConversations={conversations} userId={user.id} />
    </AppLayout>
  );
}
