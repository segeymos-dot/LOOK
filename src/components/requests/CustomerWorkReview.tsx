"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { calculatePaymentSplit, formatCommissionPercent, getPlatformCommissionRate } from "@/lib/config/finance";
import { isRequestOwner as checkRequestOwner } from "@/lib/auth/viewer-role";
import { mockCurrentUser } from "@/lib/mock/data";
import { formatPrice } from "@/lib/utils";
import type { RequestStatus, WorkAttachment, WorkSubmission } from "@/types";
import { mapUserFacingError } from "@/lib/ui/user-facing-error";
import { CheckCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

interface CustomerWorkReviewProps {
  requestId: string;
  customerId: string;
  requestStatus: RequestStatus;
  grossAmount: number;
  currency: string;
  viewerUserId?: string | null;
  viewerIsCustomer?: boolean;
  isDemo?: boolean;
  onSuccess?: () => void;
}

export function CustomerWorkReview({
  requestId,
  customerId,
  requestStatus,
  grossAmount,
  currency,
  viewerUserId = null,
  viewerIsCustomer,
  isDemo = false,
  onSuccess,
}: CustomerWorkReviewProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [submission, setSubmission] = useState<WorkSubmission | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showRevision, setShowRevision] = useState(false);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [revisionLoading, setRevisionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = checkRequestOwner({
    customerId,
    userId: user?.id ?? viewerUserId,
    viewerIsOwner: viewerIsCustomer,
    isDemo,
    demoUserId: mockCurrentUser.id,
  });

  const rate = getPlatformCommissionRate();
  const split = calculatePaymentSplit(grossAmount, rate);

  useEffect(() => {
    if (!isOwner || requestStatus !== "pending_review" || isDemo) return;
    void authFetch(`/api/requests/${requestId}/work-submission`)
      .then((r) => r.json())
      .then((d) => setSubmission(d.submission ?? null))
      .catch(() => undefined);
  }, [requestId, isOwner, requestStatus, isDemo]);

  if (!isOwner || requestStatus !== "pending_review") return null;

  const attachments = (submission?.attachments ?? []) as WorkAttachment[];

  const handleAccept = async () => {
    setError(null);
    setAcceptLoading(true);
    try {
      if (isDemo) {
        router.refresh();
        onSuccess?.();
        return;
      }
      const res = await authFetch(`/api/requests/${requestId}/accept-work`, {
        method: "POST",
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        setError(mapUserFacingError(result.error ?? t("request.acceptWorkError")));
        return;
      }
      router.refresh();
      onSuccess?.();
    } catch {
      setError(t("request.acceptWorkError"));
    } finally {
      setAcceptLoading(false);
    }
  };

  const handleRevision = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setRevisionLoading(true);
    try {
      if (isDemo) {
        router.refresh();
        onSuccess?.();
        return;
      }
      const res = await authFetch(`/api/requests/${requestId}/request-revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        setError(mapUserFacingError(result.error ?? t("request.revisionError")));
        return;
      }
      router.refresh();
      onSuccess?.();
    } catch {
      setError(t("request.revisionError"));
    } finally {
      setRevisionLoading(false);
    }
  };

  return (
    <Card padding="md" className="border-amber-200 bg-amber-50/50">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-amber-700" />
        <h3 className="font-semibold text-text-primary">{t("request.reviewTitle")}</h3>
      </div>

      {submission && (
        <div className="mb-4 space-y-2 rounded-xl bg-surface p-3 text-sm">
          <p className="whitespace-pre-wrap text-text-primary">{submission.summary}</p>
          {attachments.length > 0 && (
            <ul className="space-y-1">
              {attachments.map((a, i) => (
                <li key={i}>
                  <a href={a.url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                    {a.name}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mb-3 text-sm text-text-secondary">
        {t("request.paymentNote", {
          amount: formatPrice(split.gross, currency),
          fee: formatCommissionPercent(rate),
        })}
      </p>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!showRevision ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1 gap-2" loading={acceptLoading} onClick={handleAccept}>
            <CheckCircle className="h-4 w-4" />
            {t("request.acceptWork")}
          </Button>
          <Button
            className="flex-1 gap-2"
            variant="secondary"
            onClick={() => setShowRevision(true)}
          >
            <RefreshCw className="h-4 w-4" />
            {t("request.requestRevision")}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleRevision} className="space-y-3">
          <Textarea
            id="revision-feedback"
            label={t("request.revisionLabel")}
            rows={3}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" loading={revisionLoading} className="flex-1">
              {t("request.revisionSend")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowRevision(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
