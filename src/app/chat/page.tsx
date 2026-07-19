import { ChatListClient } from "@/components/chat/ChatListClient";
import { isDemoMode } from "@/lib/config";
import { mockConversations, mockCurrentUser } from "@/lib/mock/data";
import { fetchUserConversations } from "@/lib/data/conversations-server";
import { createClient } from "@/lib/supabase/server";

export default async function ChatListPage() {
  if (isDemoMode()) {
    return (
      <ChatListClient
        conversations={mockConversations}
        currentUserId={mockCurrentUser.id}
        loggedIn
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <ChatListClient conversations={[]} currentUserId="" loggedIn={false} />;
  }

  const conversations = await fetchUserConversations(supabase, user.id);

  return (
    <ChatListClient conversations={conversations} currentUserId={user.id} loggedIn />
  );
}
