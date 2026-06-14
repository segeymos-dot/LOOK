import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { formatRelativeTime } from "@/lib/utils";
import type { Conversation } from "@/types";

interface ConversationItemProps {
  conversation: Conversation;
  currentUserId: string;
}

export function ConversationItem({ conversation, currentUserId }: ConversationItemProps) {
  const otherUser =
    conversation.customer_id === currentUserId
      ? conversation.provider
      : conversation.customer;

  return (
    <Link
      href={`/chat/${conversation.id}`}
      className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 transition-colors hover:bg-gray-50"
    >
      {otherUser && (
        <Avatar src={otherUser.avatar_url} name={otherUser.full_name} size="lg" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <p className="truncate font-medium text-gray-900">
            {otherUser?.full_name ?? "Пользователь"}
          </p>
          {conversation.last_message_at && (
            <span className="shrink-0 text-xs text-gray-400">
              {formatRelativeTime(conversation.last_message_at)}
            </span>
          )}
        </div>

        {conversation.request && (
          <p className="truncate text-sm text-indigo-600">{conversation.request.title}</p>
        )}

        {conversation.last_message && (
          <p className="truncate text-sm text-gray-500">
            {conversation.last_message.content}
          </p>
        )}
      </div>

      {(conversation.unread_count ?? 0) > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-xs font-medium text-white">
          {conversation.unread_count}
        </span>
      )}
    </Link>
  );
}
