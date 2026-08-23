"use client";

import { cn } from "@/lib/utils";
import {
  isWorkLifecycleMessage,
  localizeChatMessageContent,
} from "@/lib/data/work-lifecycle-messages";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { Avatar } from "@/components/ui/Avatar";
import type { Message } from "@/types";
import { Check, CheckCheck } from "lucide-react";
import { useEffect, useRef } from "react";

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
}

function formatMessageTime(iso: string, locale: string): string {
  const date = new Date(iso);
  return date.toLocaleString(locale === "en" ? "en-US" : "ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageList({ messages, currentUserId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { t, locale } = useTranslation();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-surface-muted p-4">
      {messages.map((message) => {
        const isOwn = message.sender_id === currentUserId;
        const attachments = message.attachment_urls ?? [];
        const isRead = Boolean(message.read_at);
        const isDelivered = Boolean(message.delivered_at ?? message.created_at);

        const isSystem = isWorkLifecycleMessage(message.content);
        const displayContent = localizeChatMessageContent(message.content, locale);

        return (
          <div
            key={message.id}
            className={cn(
              "flex gap-2",
              isSystem ? "justify-center" : isOwn ? "flex-row-reverse" : "flex-row"
            )}
          >
            {!isOwn && !isSystem && message.sender && (
              <Avatar
                src={message.sender.avatar_url}
                name={message.sender.full_name}
                size="sm"
                className="mt-1 shrink-0"
              />
            )}
            <div
              className={cn(
                "flex max-w-[78%] flex-col",
                isOwn ? "items-end" : isSystem ? "items-center max-w-[92%]" : "items-start"
              )}
            >
              <div
                className={cn(
                  "px-4 py-2.5 text-sm leading-relaxed shadow-sm whitespace-pre-wrap",
                  isSystem
                    ? "rounded-2xl border border-border-subtle bg-surface text-text-secondary"
                    : isOwn
                      ? "rounded-2xl rounded-br-md gradient-brand text-white"
                      : "rounded-2xl rounded-bl-md bg-surface text-text-primary"
                )}
              >
                {displayContent}
                {attachments.length > 0 && (
                  <ul
                    className={cn(
                      "mt-2 space-y-1 text-xs",
                      isOwn ? "text-white/90" : "text-brand-600"
                    )}
                  >
                    {attachments.map((a, i) => (
                      <li key={i}>
                        <a href={a.url} target="_blank" rel="noreferrer" className="underline">
                          {a.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-text-muted">
                <span title={message.created_at}>
                  {formatMessageTime(message.created_at, locale)}
                </span>
                {isOwn && (
                  <span
                    className="inline-flex items-center gap-0.5"
                    title={
                      isRead
                        ? t("chat.read")
                        : isDelivered
                          ? t("chat.delivered")
                          : t("chat.sending")
                    }
                  >
                    {isRead ? (
                      <CheckCheck className="h-3 w-3 text-brand-500" />
                    ) : isDelivered ? (
                      <Check className="h-3 w-3" />
                    ) : null}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
