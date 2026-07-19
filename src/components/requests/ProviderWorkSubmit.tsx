"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { useOrderPayment } from "@/hooks/useOrderPayment";
import { authFetch } from "@/lib/auth/client-fetch";
import { isRequestOwner as checkRequestOwner } from "@/lib/auth/viewer-role";
import { mockCurrentUser } from "@/lib/mock/data";
import type { RequestStatus, WorkAttachment } from "@/types";
import { mapUserFacingError } from "@/lib/ui/user-facing-error";
import { CheckCircle, Link as LinkIcon, Lock, Paperclip, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

interface ProviderWorkSubmitProps {
  requestId: string;
  customerId: string;
  requestStatus: RequestStatus;
  viewerUserId?: string | null;
  viewerIsCustomer?: boolean;
  isDemo?: boolean;
  acceptedProviderId?: string | null;
  onSuccess?: () => void;
  revisionFeedback?: string | null;
}

export function ProviderWorkSubmit({
  requestId,
  customerId,
  requestStatus,
  viewerUserId = null,
  viewerIsCustomer,
  isDemo = false,
  acceptedProviderId,
  revisionFeedback,
  onSuccess,
}: ProviderWorkSubmitProps) {
  const router = useRouter();
  const { user, ready } = useAuth();
  const { t } = useTranslation();
  const [summary, setSummary] = useState("");
  const [attachments, setAttachments] = useState<WorkAttachment[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const activeUserId = user?.id ?? viewerUserId;
  const isProvider =
    !!acceptedProviderId && activeUserId === acceptedProviderId;
  const isOwner = checkRequestOwner({
    customerId,
    userId: activeUserId,
    viewerIsOwner: viewerIsCustomer,
    isDemo,
    demoUserId: mockCurrentUser.id,
  });

  const showWorkPanel = isProvider && !isOwner && requestStatus === "in_progress";
  const { isPaid, loading: paymentLoading } = useOrderPayment(requestId, showWorkPanel);

  if (!ready && !isDemo && !viewerUserId) {
    return null;
  }

  if (!showWorkPanel) return null;

  if (paymentLoading) return null;

  if (!isPaid) {
    return (
      <Card padding="md" className="border-amber-100 bg-amber-50/50">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold text-text-primary">{t("finance.payment.awaitingPayment")}</p>
            <p className="text-sm text-text-secondary">{t("finance.payment.providerWorkBlocked")}</p>
          </div>
        </div>
      </Card>
    );
  }

  const addLink = () => {
    if (!linkUrl.trim()) return;
    const type = /\.(png|jpe?g|webp|gif)$/i.test(linkUrl) ? "image" : "link";
    setAttachments((prev) => [
      ...prev,
      { name: linkName.trim() || t("request.attachmentDefault"), url: linkUrl.trim(), type },
    ]);
    setLinkUrl("");
    setLinkName("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isDemo) {
        setDone(true);
        router.refresh();
        return;
      }

      const res = await authFetch(`/api/requests/${requestId}/submit-work`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary, attachments }),
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        setError(mapUserFacingError(result.error ?? t("request.submitWorkError")));
        return;
      }

      setDone(true);
      onSuccess?.();
      router.refresh();
    } catch {
      setError(t("request.submitWorkError"));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <Card padding="md" className="border-emerald-200 bg-success-bg">
        <div className="flex items-center gap-2 text-emerald-800">
          <CheckCircle className="h-5 w-5" />
          <p className="text-sm font-medium">{t("request.workSubmitSent")}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="md" className="border-brand-100 bg-brand-50/40">
      <h3 className="mb-2 font-semibold text-text-primary">{t("request.workSubmitTitle")}</h3>
      {revisionFeedback && (
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>{t("request.customerComment")}</strong> {revisionFeedback}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          id="work-summary"
          label={t("request.workSubmitDesc")}
          rows={4}
          placeholder={t("request.workSummaryPlaceholder")}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />

        <div className="space-y-2">
          <p className="text-sm font-medium text-text-primary">{t("request.attachmentsLinks")}</p>
          {attachments.map((a, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-sm"
            >
              <a href={a.url} target="_blank" rel="noreferrer" className="truncate text-brand-600">
                {a.name}
              </a>
              <button type="button" onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}>
                <X className="h-4 w-4 text-text-muted" />
              </button>
            </div>
          ))}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder={t("request.fileNamePlaceholder")}
              value={linkName}
              onChange={(e) => setLinkName(e.target.value)}
            />
            <Input
              placeholder="https://..."
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <Button type="button" variant="secondary" onClick={addLink} className="shrink-0 gap-1">
              <LinkIcon className="h-4 w-4" />
              {t("request.add")}
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button type="submit" loading={loading} className="w-full gap-2">
          <Paperclip className="h-4 w-4" />
          {t("request.workDone")}
        </Button>
      </form>
    </Card>
  );
}
