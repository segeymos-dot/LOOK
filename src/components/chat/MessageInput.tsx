"use client";

import { Button } from "@/components/ui/Button";
import { Send } from "lucide-react";
import { FormEvent, useState } from "react";

interface MessageInputProps {
  onSend: (content: string) => Promise<void>;
  disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim() || sending) return;

    setSending(true);
    await onSend(content.trim());
    setContent("");
    setSending(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 border-t border-border-subtle bg-surface p-3 pb-safe"
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Написать сообщение..."
        rows={1}
        disabled={disabled || sending}
        className="max-h-32 flex-1 resize-none rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
      />
      <Button
        type="submit"
        size="sm"
        disabled={!content.trim() || disabled || sending}
        className="h-11 w-11 shrink-0 rounded-2xl p-0"
      >
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}
