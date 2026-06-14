import { AppLayout } from "@/components/layout/AppLayout";
import { ConversationItem } from "@/components/chat/ConversationItem";
import { isDemoMode } from "@/lib/config";
import { mockConversations, mockCurrentUser } from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

export default async function ChatListPage() {
  if (isDemoMode()) {
    const user = mockCurrentUser;

    return (
      <AppLayout activePath="/chat">
        <div className="p-4">
          <h1 className="mb-4 text-xl font-bold">Чаты</h1>
        </div>

        <div>
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
      <AppLayout activePath="/chat">
        <div className="flex flex-col items-center justify-center px-4 py-20">
          <MessageCircle className="mb-4 h-12 w-12 text-gray-300" />
          <p className="mb-4 text-gray-500">Войдите, чтобы видеть чаты</p>
          <Link href="/login" className="text-indigo-600">
            Войти
          </Link>
        </div>
      </AppLayout>
    );
  }

  const { data: conversations } = await supabase
    .from("conversations")
    .select(
      "*, customer:profiles!conversations_customer_id_fkey(*), provider:profiles!conversations_provider_id_fkey(*), request:requests(*)"
    )
    .or(`customer_id.eq.${user.id},provider_id.eq.${user.id}`)
    .order("last_message_at", { ascending: false });

  return (
    <AppLayout activePath="/chat">
      <div className="p-4">
        <h1 className="mb-4 text-xl font-bold">Чаты</h1>
      </div>

      {conversations && conversations.length > 0 ? (
        <div>
          {conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              currentUserId={user.id}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center px-4 py-20">
          <MessageCircle className="mb-4 h-12 w-12 text-gray-300" />
          <p className="text-gray-500">Нет активных чатов</p>
        </div>
      )}
    </AppLayout>
  );
}
