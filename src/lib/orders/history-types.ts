import type {
  OfferStatus,
  OrderPaymentStatus,
  OrderPayoutStatus,
  RefundDisputeStatus,
  RequestStatus,
} from "@/types";

export type OrderHistoryTab =
  | "active"
  | "completed"
  | "cancelled_refunded"
  | "disputed"
  | "archived"
  | "all";

export type OrderHistorySort =
  | "newest"
  | "oldest"
  | "amount_desc"
  | "amount_asc"
  | "status"
  | "activity";

export type OrderHistoryViewer = "customer" | "provider" | "admin";

export type OrderHistoryFilters = {
  tab?: OrderHistoryTab;
  q?: string;
  status?: RequestStatus | "all";
  paymentStatus?: OrderPaymentStatus | "all";
  refundDisputeStatus?: RefundDisputeStatus | "all";
  offerStatus?: OfferStatus | "all";
  customerId?: string;
  providerId?: string;
  categoryId?: string;
  location?: string;
  from?: string;
  to?: string;
  amountMin?: number;
  amountMax?: number;
  testOnly?: boolean | null;
  sort?: OrderHistorySort;
  page?: number;
  pageSize?: number;
};

export type OrderHistoryItem = {
  id: string;
  title: string;
  description: string;
  status: RequestStatus;
  history_label: string;
  category_id: string | null;
  category_name: string | null;
  location: string | null;
  currency: string;
  budget_max: number | null;
  agreed_amount: number | null;
  order_payment_status: OrderPaymentStatus | null;
  refund_dispute_status: RefundDisputeStatus | null;
  payout_status: OrderPayoutStatus | null;
  customer_id: string;
  customer_name: string | null;
  provider_id: string | null;
  provider_name: string | null;
  offer_id: string | null;
  offer_status: OfferStatus | null;
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  paid_at: string | null;
  work_submitted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  archived_at: string | null;
  trashed_at: string | null;
  has_revision: boolean;
  review_status: "none" | "left" | "received" | "both";
  is_test: boolean;
  dispute_id: string | null;
};

export const ORDER_HISTORY_PAGE_SIZE = 20;

export function resolveHistoryLabel(input: {
  status: RequestStatus;
  orderPaymentStatus?: OrderPaymentStatus | null;
  refundDisputeStatus?: RefundDisputeStatus | null;
  offerStatus?: OfferStatus | null;
  hasRevision?: boolean;
  archivedAt?: string | null;
}): string {
  if (input.archivedAt) return "archived";
  if (input.refundDisputeStatus === "dispute_opened") return "disputed";
  if (
    input.refundDisputeStatus === "refunded" ||
    input.orderPaymentStatus === "refunded"
  ) {
    return input.status === "cancelled" ? "cancelled_refunded" : "refunded";
  }
  if (input.status === "cancelled") return "cancelled";
  if (input.status === "completed") return "completed";
  if (input.status === "pending_review") return "pending_review";
  if (input.hasRevision && input.status === "in_progress") return "revision_requested";
  if (input.status === "in_progress") {
    if (input.orderPaymentStatus === "unpaid" || input.orderPaymentStatus === "payment_pending") {
      return "unpaid";
    }
    return "in_progress";
  }
  if (input.status === "open") {
    if (input.offerStatus === "pending") return "offer_pending";
    if (input.offerStatus === "rejected") return "offer_rejected";
    if (input.offerStatus === "accepted") return "offer_accepted";
    return "awaiting_offers";
  }
  return input.status;
}
