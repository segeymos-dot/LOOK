import type {
  OrderPaymentStatus,
  RefundDisputeStatus,
  RequestStatus,
} from "@/types";

export type CancelOutcomePreview =
  | "cancelled_unpaid"
  | "refunded"
  | "dispute_opened"
  | "already_refunded"
  | "already_disputed"
  | "blocked";

/** Pure helper — safe for client bundles. */
export function previewCancelOutcome(ctx: {
  status: RequestStatus;
  orderPaymentStatus?: OrderPaymentStatus | null;
  paymentStatus?: string | null;
  workSubmittedAt?: string | null;
  hasWorkSubmission?: boolean;
  refundDisputeStatus?: RefundDisputeStatus | null;
}): CancelOutcomePreview {
  if (
    ctx.refundDisputeStatus === "refunded" ||
    ctx.orderPaymentStatus === "refunded" ||
    ctx.paymentStatus === "refunded"
  ) {
    return "already_refunded";
  }
  if (ctx.refundDisputeStatus === "dispute_opened") {
    return "already_disputed";
  }

  const paid =
    ctx.paymentStatus === "paid" ||
    ctx.orderPaymentStatus === "paid" ||
    ctx.orderPaymentStatus === "completed";

  if (!paid) return "cancelled_unpaid";

  const workStarted =
    ctx.status === "pending_review" ||
    Boolean(ctx.workSubmittedAt) ||
    Boolean(ctx.hasWorkSubmission);

  return workStarted ? "dispute_opened" : "refunded";
}
