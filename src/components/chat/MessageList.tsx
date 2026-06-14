"use client";

import { cn, formatRelativeTime } from "@/lib/utils";
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
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {messages.map((message) => {
        const isOwn = message.sender_id === currentUserId;

        return (
          <div
            key={message.id}
            className={cn("flex flex-col", isOwn ? "items-end" : "items-start")}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                isOwn
                  ? "rounded-br-md bg-indigo-600 text-white"
                  : "rounded-bl-md bg-white text-gray-900 shadow-sm"
              )}
            >
              {message.content}
            </div>
            <span className="mt-1 text-xs text-gray-400">
              {formatRelativeTime(message.created_at)}
            </span>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
