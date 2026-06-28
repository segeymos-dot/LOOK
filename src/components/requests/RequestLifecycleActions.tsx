"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { mockCurrentUser } from "@/lib/mock/data";
import { isRequestOwner as checkRequestOwner } from "@/lib/auth/viewer-role";
import { mapUserFacingErrorT } from "@/lib/i18n/client-messages";
import type { RequestStatus } from "@/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function mapLifecycleError(message: string, t: (key: string) => string): string {
  if (message.includes("must be in progress")) {
    return t("request.lifecycle.mustBeInProgress");
  }
  if (message.includes("cannot be cancelled")) {
    return t("request.lifecycle.cannotCancel");
  }
  if (message.includes("must be paid")) {
    return t("request.lifecycle.mustPayFirst");
  }
  if (message.includes("not found or not authorized")) {
    return t("request.lifecycle.unauthorized");
  }
  return mapUserFacingErrorT(message, t);
}

interface RequestLifecycleActionsProps {
  requestId: string;
  customerId: string;
  initialStatus: RequestStatus;
  viewerUserId?: string | null;
  viewerIsCustomer?: boolean;
  isDemo?: boolean;
}

export function RequestLifecycleActions({
  requestId,
  customerId,
  initialStatus,
  viewerUserId = null,
  viewerIsCustomer,
  isDemo = false,
}: RequestLifecycleActionsProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [status, setStatus] = useState(initialStatus);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  const isRequestOwner = checkRequestOwner({
    customerId,
    userId: user?.id ?? viewerUserId,
    viewerIsOwner: viewerIsCustomer,
    isDemo,
    demoUserId: mockCurrentUser.id,
  });

  if (!isRequestOwner) return null;

  const canCancel = status === "open" || status === "in_progress" || status === "pending_review";

  if (!canCancel) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">{t("request.statusLabel")}</p>
          <Badge status={status} />
        </div>
      </div>
    );
  }

  const handleCancel = async () => {
    if (!confirm(t("request.cancelConfirm"))) return;

    setError(null);
    setCancelLoading(true);

    try {
      if (isDemo) {
        setStatus("cancelled");
        router.refresh();
        return;
      }

      const response = await authFetch(`/api/requests/${requestId}/cancel`, {
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(mapLifecycleError(result.error ?? t("request.cancelError"), t));
        return;
      }

      setStatus(result.status);
      router.refresh();
    } catch {
      setError(t("request.cancelError"));
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-text-primary">{t("request.manageTitle")}</p>
        <Badge status={status} />
      </div>

      {status === "pending_review" && (
        <p className="mb-3 text-sm text-text-secondary">{t("request.pendingReviewCustomer")}</p>
      )}

      {status === "in_progress" && (
        <p className="mb-3 text-sm text-text-secondary">{t("request.inProgressCustomer")}</p>
      )}

      {error && (
        <p className="mb-3 rounded-xl bg-danger-bg px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        {canCancel && (
          <Button
            className="flex-1"
            variant="secondary"
            loading={cancelLoading}
            onClick={handleCancel}
          >
            {t("request.cancel")}
          </Button>
        )}
      </div>
    </div>
  );
}
