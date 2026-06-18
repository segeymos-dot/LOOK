"use client";

import { cn, formatRelativeTime } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import type { Message } from "@/types";
import { useEffect, useRef } from "react";

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
}

export function MessageList({ messages, currentUserId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-surface-muted p-4">
      {messages.map((message) => {
        const isOwn = message.sender_id === currentUserId;

        return (
          <div
            key={message.id}
            className={cn("flex gap-2", isOwn ? "flex-row-reverse" : "flex-row")}
          >
            {!isOwn && message.sender && (
              <Avatar
                src={message.sender.avatar_url}
                name={message.sender.full_name}
                size="sm"
                className="mt-1 shrink-0"
              />
            )}
            <div className={cn("flex max-w-[78%] flex-col", isOwn ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                  isOwn
                    ? "rounded-2xl rounded-br-md gradient-brand text-white"
                    : "rounded-2xl rounded-bl-md bg-surface text-text-primary"
                )}
              >
                {message.content}
              </div>
              <span className="mt-1 text-[10px] text-text-muted">
                {formatRelativeTime(message.created_at)}
              </span>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
