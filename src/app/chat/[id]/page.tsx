"use client";

import { Avatar } from "@/components/ui/Avatar";
import { DemoBanner } from "@/components/layout/DemoBanner";
import { MessageInput } from "@/components/chat/MessageInput";
import { MessageList } from "@/components/chat/MessageList";
import { OrderWorkLifecyclePanel } from "@/components/requests/OrderWorkLifecyclePanel";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { authFetch } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/config";
import { getMockConversation } from "@/lib/mock/data";
import { localizeText } from "@/lib/i18n/localize-data";
import type { RequestStatus, WorkAttachment } from "@/types";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";

type LifecycleInfo = {
  requestId: string;
  customerId: string;
  effectiveStatus: RequestStatus;
  revisionFeedback: string | null;
  acceptedProviderId: string | null;
  grossAmount: number;
  currency: string;
};

export default function ChatDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { locale } = useTranslation();
  const { messages, loading, sendMessage } = useMessages(id, user?.id);
  const [otherUserName, setOtherUserName] = useState("");
  const [otherUserAvatar, setOtherUserAvatar] = useState<string | null>(null);
  const [requestTitle, setRequestTitle] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleInfo | null>(null);

  const refreshLifecycle = useCallback(async (reqId: string) => {
    const response = await authFetch(`/api/requests/${reqId}/lifecycle`);
    if (!response.ok) return;
    const data = (await response.json()) as LifecycleInfo;
    setLifecycle(data);
  }, []);

  useEffect(() => {
    if (isDemoMode()) {
      const data = getMockConversation(id);
      if (data && user) {
        const other =
          data.customer_id === user.id ? data.provider : data.customer;
        setOtherUserName(other?.full_name ?? "");
        setOtherUserAvatar(other?.avatar_url ?? null);
        setRequestTitle(data.request?.title ?? "");
        setRequestId(data.request_id);
      }
      return;
    }

    const fetchConversation = async () => {
      const response = await authFetch(`/api/conversations/${id}`);
      if (!response.ok) return;

      const { conversation: data } = (await response.json()) as {
        conversation?: {
          customer_id: string;
          request_id: string;
          provider?: { full_name: string; avatar_url?: string | null };
          customer?: { full_name: string; avatar_url?: string | null };
          request?: { id: string; title: string };
        };
      };

      if (data && user) {
        const other =
          data.customer_id === user.id ? data.provider : data.customer;
        setOtherUserName(other?.full_name ?? "");
        setOtherUserAvatar(other?.avatar_url ?? null);
        setRequestTitle(data.request?.title ?? "");
        const reqId = data.request?.id ?? data.request_id;
        setRequestId(reqId);
        if (reqId) await refreshLifecycle(reqId);
      }
    };

    if (user) void fetchConversation();
  }, [id, user, refreshLifecycle]);

  const handleSend = async (content: string, attachments?: WorkAttachment[]) => {
    if (!user) return;
    const result = await sendMessage(content, user.id, attachments);
    if (result.error) {
      throw new Error(result.error.message);
    }
  };

  useEffect(() => {
    if (requestId && !isDemoMode()) {
      void refreshLifecycle(requestId);
    }
  }, [messages.length, requestId, refreshLifecycle]);

  const handleLifecycleChange = () => {
    if (requestId) void refreshLifecycle(requestId);
    router.refresh();
  };

  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col bg-surface-muted">
      <header className="glass-header border-b border-border-subtle pt-safe">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            href="/chat"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-text-secondary shadow-card hover:bg-brand-50 hover:text-brand-600"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <Avatar src={otherUserAvatar} name={otherUserName || "?"} size="md" ring />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-text-primary">{otherUserName}</p>
            {requestTitle && (
              <Link href={requestId ? `/requests/${requestId}` : "/search"} className="truncate text-xs text-brand-600 hover:underline">
                {localizeText(requestTitle, locale)}
              </Link>
            )}
          </div>
        </div>
        <DemoBanner />
      </header>

      {lifecycle &&
        lifecycle.effectiveStatus !== "open" &&
        lifecycle.effectiveStatus !== "cancelled" && (
          <div className="border-b border-border-subtle bg-surface p-3">
            <OrderWorkLifecyclePanel
              requestId={lifecycle.requestId}
              customerId={lifecycle.customerId}
              requestStatus={lifecycle.effectiveStatus}
              grossAmount={lifecycle.grossAmount}
              currency={lifecycle.currency}
              acceptedProviderId={lifecycle.acceptedProviderId}
              revisionFeedback={lifecycle.revisionFeedback}
              viewerUserId={user?.id ?? null}
              viewerIsCustomer={user?.id === lifecycle.customerId}
              onSuccess={handleLifecycleChange}
            />
          </div>
        )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
        </div>
      ) : (
        <MessageList messages={messages} currentUserId={user?.id ?? ""} />
      )}

      <MessageInput onSend={handleSend} disabled={!user} />
    </div>
  );
}
