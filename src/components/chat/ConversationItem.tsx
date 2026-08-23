"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { formatRelativeTimeT } from "@/lib/i18n/client-messages";
import { localizeConversation } from "@/lib/i18n/localize-data";
import type { Conversation } from "@/types";
import { ChevronRight } from "lucide-react";

interface ConversationItemProps {
  conversation: Conversation;
  currentUserId: string;
}

export function ConversationItem({ conversation, currentUserId }: ConversationItemProps) {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const localized = localizeConversation(conversation, locale);
  const viewerIsCustomer = conversation.customer_id === currentUserId;
  const otherUser = viewerIsCustomer
    ? conversation.provider
    : conversation.customer;
  const providerProfileId = viewerIsCustomer ? conversation.provider_id : null;

  const openProviderProfile = (e: MouseEvent | KeyboardEvent) => {
    if (!providerProfileId) return;
    e.preventDefault();
    e.stopPropagation();
    router.push(`/providers/${providerProfileId}`);
  };

  const onProviderKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") openProviderProfile(e);
  };

  return (
    <Link
      href={`/chat/${conversation.id}`}
      className="flex items-center gap-3 border-b border-border-subtle px-4 py-4 transition-colors hover:bg-slate-50 active:bg-slate-100"
    >
      {otherUser && (
        <span
          role={providerProfileId ? "link" : undefined}
          tabIndex={providerProfileId ? 0 : undefined}
          onClick={providerProfileId ? openProviderProfile : undefined}
          onKeyDown={providerProfileId ? onProviderKeyDown : undefined}
          className={providerProfileId ? "shrink-0 cursor-pointer" : "shrink-0"}
        >
          <Avatar src={otherUser.avatar_url} name={otherUser.full_name} size="lg" ring />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            role={providerProfileId ? "link" : undefined}
            tabIndex={providerProfileId ? 0 : undefined}
            onClick={providerProfileId ? openProviderProfile : undefined}
            onKeyDown={providerProfileId ? onProviderKeyDown : undefined}
            className={
              providerProfileId
                ? "truncate font-semibold text-text-primary hover:text-brand-600"
                : "truncate font-semibold text-text-primary"
            }
          >
            {otherUser?.full_name ?? t("chat.unknownUser")}
          </p>
          {conversation.last_message_at && (
            <span className="shrink-0 text-xs text-text-muted">
              {formatRelativeTimeT(conversation.last_message_at, t, locale)}
            </span>
          )}
        </div>

        {localized.request && (
          <p className="truncate text-sm font-medium text-brand-600">
            {localized.request.title}
          </p>
        )}

        {localized.last_message ? (
          <p className="truncate text-sm text-text-secondary">
            {localized.last_message.sender_id === currentUserId ? t("chat.youPrefix") : ""}
            {localized.last_message.content}
          </p>
        ) : (
          <p className="truncate text-sm text-text-muted">{t("chat.noMessages")}</p>
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
