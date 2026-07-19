"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useTranslation } from "@/components/providers/LocaleProvider";
import type { WorkAttachment } from "@/types";
import { Link as LinkIcon, Paperclip, Send, X } from "lucide-react";
import { FormEvent, useState } from "react";

interface MessageInputProps {
  onSend: (content: string, attachments?: WorkAttachment[]) => Promise<void>;
  disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<WorkAttachment[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [showAttach, setShowAttach] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const addLink = () => {
    if (!linkUrl.trim()) return;
    const type = /\.(png|jpe?g|webp|gif)$/i.test(linkUrl)
      ? "image"
      : /\.(pdf|docx?|xlsx?)$/i.test(linkUrl)
        ? "document"
        : "link";
    setAttachments((prev) => [
      ...prev,
      { name: linkName.trim() || t("request.attachmentDefault"), url: linkUrl.trim(), type },
    ]);
    setLinkUrl("");
    setLinkName("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if ((!content.trim() && attachments.length === 0) || sending) return;

    setSending(true);
    setSendError(null);
    try {
      await onSend(content.trim(), attachments.length > 0 ? attachments : undefined);
      setContent("");
      setAttachments([]);
      setShowAttach(false);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : t("chat.sendError"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-t border-border-subtle bg-surface pb-safe">
      {showAttach && (
        <div className="space-y-2 border-b border-border-subtle px-3 py-2">
          {attachments.map((a, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl bg-surface-muted px-3 py-2 text-sm"
            >
              <span className="truncate text-brand-600">{a.name}</span>
              <button type="button" onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}>
                <X className="h-4 w-4 text-text-muted" />
              </button>
            </div>
          ))}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder={t("chat.linkName")}
              value={linkName}
              onChange={(e) => setLinkName(e.target.value)}
            />
            <Input
              placeholder="https://..."
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <Button type="button" variant="secondary" size="sm" onClick={addLink} className="shrink-0 gap-1">
              <LinkIcon className="h-4 w-4" />
              {t("common.add")}
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 p-3">
        {sendError && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {sendError}
          </p>
        )}
        <div className="flex items-end gap-2">
        <button
          type="button"
          disabled={disabled || sending}
          onClick={() => setShowAttach((v) => !v)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border-subtle text-text-muted hover:bg-surface-muted hover:text-text-secondary disabled:opacity-50"
          title={t("chat.attach")}
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t("chat.placeholder")}
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
          disabled={(!content.trim() && attachments.length === 0) || disabled || sending}
          className="h-11 w-11 shrink-0 rounded-2xl p-0"
        >
          <Send className="h-4 w-4" />
        </Button>
        </div>
      </form>
    </div>
  );
}
