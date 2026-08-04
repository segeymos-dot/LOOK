"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { isDemoMode } from "@/lib/config";
import { formatPrice } from "@/lib/utils";
import type { AdminDisputeDetail, SettlementPreview } from "@/lib/admin/disputes";
import type { DisputeResolutionDecision } from "@/types";

const DECISIONS: DisputeResolutionDecision[] = [
  "full_refund_customer",
  "partial_refund",
  "release_full_payout",
  "split_settlement",
  "reject",
];

export default function AdminDisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { isPlatformAdmin, ready, profileReady } = useAuth();
  const demo = isDemoMode();

  const [dispute, setDispute] = useState<AdminDisputeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<DisputeResolutionDecision>("full_refund_customer");
  const [note, setNote] = useState("");
  const [customerRefund, setCustomerRefund] = useState("");
  const [providerRelease, setProviderRelease] = useState("");
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const needsAmounts = decision === "partial_refund" || decision === "split_settlement";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/admin/disputes/${id}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("admin.errors.loadFailed"));
        setDispute(null);
        return;
      }
      setDispute(data.dispute);
    } catch {
      setError(t("admin.errors.loadFailed"));
      setDispute(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    if (!ready || !profileReady) return;
    if (!isPlatformAdmin && !demo) {
      router.replace("/profile");
      return;
    }
    void load();
  }, [ready, profileReady, isPlatformAdmin, demo, router, load]);

  const loadPreview = async () => {
    setPreviewLoading(true);
    setMessage(null);
    try {
      const res = await authFetch(`/api/admin/disputes/${id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          customerRefund: needsAmounts ? Number(customerRefund || 0) : undefined,
          providerRelease: needsAmounts ? Number(providerRelease || 0) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPreview(null);
        setMessage(data.error ?? t("admin.disputes.previewError"));
        return;
      }
      setPreview(data.preview);
    } catch {
      setPreview(null);
      setMessage(t("admin.disputes.previewError"));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleResolve = async () => {
    if (note.trim().length < 5) {
      setMessage(t("admin.disputes.noteRequired"));
      return;
    }
    if (!preview) {
      setMessage(t("admin.disputes.previewFirst"));
      return;
    }
    setResolveLoading(true);
    setMessage(null);
    try {
      const res = await authFetch(`/api/admin/disputes/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          resolutionNote: note.trim(),
          customerRefund: needsAmounts ? Number(customerRefund || 0) : undefined,
          providerRelease: needsAmounts ? Number(providerRelease || 0) : undefined,
          idempotencyKey: `${id}:${decision}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage(data.error ?? t("admin.disputes.resolveError"));
        return;
      }
      setMessage(
        data.alreadyResolved
          ? t("admin.disputes.alreadyResolved")
          : t("admin.disputes.resolveSuccess")
      );
      setPreview(null);
      await load();
    } catch {
      setMessage(t("admin.disputes.resolveError"));
    } finally {
      setResolveLoading(false);
    }
  };

  const open = dispute?.status === "opened";

  const effectRows = useMemo(() => preview?.effects ?? [], [preview]);

  if (!ready || !profileReady) return null;
  if (!isPlatformAdmin && !demo) return null;

  return (
    <AppLayout hideNav title={t("admin.disputes.detailTitle")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("admin.disputes.detailTitle")}
          subtitle={dispute?.request_title ?? t("admin.disputes.subtitle")}
          backHref="/admin/disputes"
        />
        <AdminSectionNav activeHref="/admin/disputes" />

        {loading && <p className="text-sm text-text-muted">{t("common.loading")}</p>}
        {error && (
          <p className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</p>
        )}

        {dispute && (
          <>
            <Card padding="md" className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Link href={`/requests/${dispute.request_id}`}>
                  <Button size="sm" variant="outline">
                    {t("admin.links.openOrder")}
                  </Button>
                </Link>
                {dispute.conversation_id && (
                  <Link href={`/admin/conversations/${dispute.conversation_id}`}>
                    <Button size="sm" variant="outline">
                      {t("request.openChat")}
                    </Button>
                  </Link>
                )}
              </div>
              <p className="text-sm">
                <span className="text-text-muted">{t("admin.disputes.statusLabel")}: </span>
                {t(`admin.disputes.status.${dispute.status}`)}
              </p>
              <p className="text-sm">
                <span className="text-text-muted">{t("request.customer")}: </span>
                {dispute.customer_name}
              </p>
              <p className="text-sm">
                <span className="text-text-muted">{t("admin.directory.provider")}: </span>
                {dispute.provider_name ?? "—"}
              </p>
              <p className="text-sm">
                <span className="text-text-muted">{t("admin.disputes.openedBy")}: </span>
                {dispute.opener_name} ·{" "}
                {new Date(dispute.created_at).toLocaleString(
                  locale === "en" ? "en-US" : "ru-RU"
                )}
              </p>
              <p className="text-sm">
                <span className="text-text-muted">{t("admin.disputes.amount")}: </span>
                {dispute.amount_gross != null
                  ? formatPrice(dispute.amount_gross, dispute.currency)
                  : "—"}{" "}
                · {dispute.payment_status ?? "—"}
              </p>
              <div className="rounded-xl border border-orange-200 bg-orange-50/60 px-3 py-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-800">
                  {t("request.disputeDetails.reasonLabel")}
                </p>
                <p className="whitespace-pre-wrap text-sm text-text-primary">{dispute.reason}</p>
              </div>
            </Card>

            <Card padding="md" className="space-y-2">
              <h2 className="font-semibold text-text-primary">
                {t("admin.disputes.revisionHistory")}
              </h2>
              {dispute.revision_history.length === 0 &&
              dispute.work_submissions.length === 0 ? (
                <p className="text-sm text-text-muted">{t("admin.disputes.noRevisions")}</p>
              ) : (
                <>
                  {dispute.revision_history.map((r, i) => (
                    <div
                      key={`rev-${i}`}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
                    >
                      <p className="text-xs text-amber-800">
                        {t("request.revisionRequestLabel")} ·{" "}
                        {new Date(r.at).toLocaleString(locale === "en" ? "en-US" : "ru-RU")}
                      </p>
                      <p className="whitespace-pre-wrap text-amber-950">{r.feedback}</p>
                    </div>
                  ))}
                  {dispute.work_submissions.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl border border-border-subtle bg-surface-muted px-3 py-2 text-sm"
                    >
                      <p className="text-xs text-text-muted">
                        {t("admin.disputes.workSubmission")} #{s.revision_number} ·{" "}
                        {new Date(s.created_at).toLocaleString(
                          locale === "en" ? "en-US" : "ru-RU"
                        )}
                      </p>
                      <p className="whitespace-pre-wrap">{s.summary}</p>
                    </div>
                  ))}
                </>
              )}
            </Card>

            {!open && (
              <Card padding="md" className="space-y-3">
                <h2 className="font-semibold text-text-primary">
                  {t("request.disputeDetails.resolvedTitle")}
                </h2>
                <p className="text-sm">
                  <span className="text-text-muted">
                    {t("request.disputeDetails.decisionLabel")}:{" "}
                  </span>
                  {dispute.resolution_decision
                    ? t(`admin.disputes.decisions.${dispute.resolution_decision}`)
                    : "—"}
                </p>
                <p className="text-sm">
                  <span className="text-text-muted">
                    {t("admin.disputes.resolvedBy")}:{" "}
                  </span>
                  {dispute.resolver_name ?? t("role.admin")}
                  {dispute.resolved_at
                    ? ` · ${new Date(dispute.resolved_at).toLocaleString(
                        locale === "en" ? "en-US" : "ru-RU"
                      )}`
                    : ""}
                </p>
                <div className="rounded-xl border border-border-subtle bg-surface-muted px-3 py-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    {t("request.disputeDetails.resolutionNoteLabel")}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-text-primary">
                    {dispute.resolution_note?.trim() || "—"}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    {t("request.disputeDetails.resolutionNoteImmutable")}
                  </p>
                </div>
                <div className="rounded-xl border border-border-subtle bg-surface-muted px-3 py-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    {t("request.disputeDetails.settlementLabel")}
                  </p>
                  <ul className="space-y-1 text-sm">
                    <li className="flex justify-between gap-3">
                      <span className="text-text-secondary">
                        {t("request.disputeDetails.settlement.customerRefund")}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatPrice(dispute.customer_refund_amount ?? 0, dispute.currency)}
                      </span>
                    </li>
                    <li className="flex justify-between gap-3">
                      <span className="text-text-secondary">
                        {t("request.disputeDetails.settlement.providerRetained")}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatPrice(dispute.provider_release_amount ?? 0, dispute.currency)}
                      </span>
                    </li>
                    <li className="flex justify-between gap-3">
                      <span className="text-text-secondary">
                        {t("request.disputeDetails.settlement.providerReversed")}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatPrice(
                          Math.max(
                            0,
                            Number(dispute.amounts_before?.provider_amount ?? 0) -
                              (dispute.provider_release_amount ?? 0)
                          ),
                          dispute.currency
                        )}
                      </span>
                    </li>
                    <li className="flex justify-between gap-3">
                      <span className="text-text-secondary">
                        {t("request.disputeDetails.settlement.commissionRetained")}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatPrice(dispute.platform_fee_retained ?? 0, dispute.currency)}
                      </span>
                    </li>
                    <li className="flex justify-between gap-3">
                      <span className="text-text-secondary">
                        {t("request.disputeDetails.settlement.commissionReversed")}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatPrice(
                          Math.max(
                            0,
                            Number(dispute.amounts_before?.platform_fee ?? 0) -
                              (dispute.platform_fee_retained ?? 0)
                          ),
                          dispute.currency
                        )}
                      </span>
                    </li>
                  </ul>
                  <p className="mt-3 text-sm">
                    <span className="text-text-muted">
                      {t("request.disputeDetails.finalPaymentStatus")}:{" "}
                    </span>
                    <span className="font-semibold text-text-primary">
                      {dispute.order_payment_status === "refunded"
                        ? t("request.disputeDetails.paymentStatus.refunded")
                        : dispute.order_payment_status === "completed" ||
                            dispute.refund_dispute_status === "refund_rejected"
                          ? t("request.disputeDetails.paymentStatus.paid_out")
                          : dispute.order_payment_status
                            ? t(`finance.orderPaymentStatus.${dispute.order_payment_status}`)
                            : "—"}
                    </span>
                  </p>
                </div>
              </Card>
            )}

            {open && (
              <Card padding="md" className="space-y-3">
                <h2 className="font-semibold text-text-primary">
                  {t("admin.disputes.resolveTitle")}
                </h2>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">{t("admin.disputes.decisionLabel")}</span>
                  <select
                    className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2"
                    value={decision}
                    onChange={(e) => {
                      setDecision(e.target.value as DisputeResolutionDecision);
                      setPreview(null);
                    }}
                  >
                    {DECISIONS.map((d) => (
                      <option key={d} value={d}>
                        {t(`admin.disputes.decisions.${d}`)}
                      </option>
                    ))}
                  </select>
                </label>

                {needsAmounts && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      label={t("admin.disputes.customerRefundAmount")}
                      type="number"
                      min="0"
                      step="0.01"
                      value={customerRefund}
                      onChange={(e) => {
                        setCustomerRefund(e.target.value);
                        setPreview(null);
                      }}
                    />
                    <Input
                      label={t("admin.disputes.providerReleaseAmount")}
                      type="number"
                      min="0"
                      step="0.01"
                      value={providerRelease}
                      onChange={(e) => {
                        setProviderRelease(e.target.value);
                        setPreview(null);
                      }}
                    />
                  </div>
                )}

                <Textarea
                  id="resolution-note"
                  label={t("admin.disputes.resolutionNote")}
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("admin.disputes.resolutionNotePlaceholder")}
                />

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" loading={previewLoading} onClick={() => void loadPreview()}>
                    {t("admin.disputes.showEffect")}
                  </Button>
                  <Button
                    loading={resolveLoading}
                    disabled={!preview}
                    onClick={() => void handleResolve()}
                  >
                    {t("admin.disputes.confirmResolve")}
                  </Button>
                </div>

                {preview && (
                  <div className="rounded-xl border border-border-subtle bg-surface-muted p-3 text-sm">
                    <p className="mb-2 font-semibold">{t("admin.disputes.effectTitle")}</p>
                    <ul className="space-y-1">
                      {effectRows.map((e, i) => (
                        <li key={`${e.label}-${i}`}>
                          {t(`admin.disputes.effect.${e.label}`, {
                            amount: formatPrice(e.amount, preview.currency),
                          })}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-text-muted">
                      {t("admin.disputes.testSettlementOnly")}
                    </p>
                  </div>
                )}
              </Card>
            )}

            {message && (
              <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm text-text-primary">
                {message}
              </p>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
