import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { formatRelativeTime } from "@/lib/utils";
import type { Conversation } from "@/types";
import { ChevronRight } from "lucide-react";

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
      className="flex items-center gap-3 border-b border-border-subtle px-4 py-4 transition-colors hover:bg-slate-50 active:bg-slate-100"
    >
      {otherUser && (
        <Avatar src={otherUser.avatar_url} name={otherUser.full_name} size="lg" ring />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-semibold text-text-primary">
            {otherUser?.full_name ?? "Пользователь"}
          </p>
          {conversation.last_message_at && (
            <span className="shrink-0 text-xs text-text-muted">
              {formatRelativeTime(conversation.last_message_at)}
            </span>
          )}
        </div>

        {conversation.request && (
          <p className="truncate text-sm font-medium text-brand-600">
            {conversation.request.title}
          </p>
        )}

        {conversation.last_message ? (
          <p className="truncate text-sm text-text-secondary">
            {conversation.last_message.sender_id === currentUserId ? "Вы: " : ""}
            {conversation.last_message.content}
          </p>
        ) : (
          <p className="truncate text-sm text-text-muted">Нет сообщений</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {(conversation.unread_count ?? 0) > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full gradient-brand px-1.5 text-xs font-bold text-white">
            {conversation.unread_count}
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-text-muted" />
      </div>
    </Link>
  );
}
