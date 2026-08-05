import { requireAdminContext } from "@/lib/admin/require-admin";
import {
  listAdminOrderHistory,
  orderHistoryToCsv,
} from "@/lib/data/order-history";
import type { OrderHistoryFilters, OrderHistorySort, OrderHistoryTab } from "@/lib/orders/history-types";
import type {
  OrderPaymentStatus,
  RefundDisputeStatus,
  RequestStatus,
} from "@/types";
import { NextResponse } from "next/server";

function parseFilters(url: URL): OrderHistoryFilters {
  const n = (key: string) => {
    const v = url.searchParams.get(key);
    if (v == null || v === "") return undefined;
    const num = Number(v);
    return Number.isFinite(num) ? num : undefined;
  };
  const bool = (key: string): boolean | null | undefined => {
    const v = url.searchParams.get(key);
    if (v == null || v === "") return undefined;
    if (v === "1" || v === "true") return true;
    if (v === "0" || v === "false") return false;
    return null;
  };

  return {
    tab: (url.searchParams.get("tab") as OrderHistoryTab) || "all",
    q: url.searchParams.get("q") ?? undefined,
    status: (url.searchParams.get("status") as RequestStatus | "all") || undefined,
    paymentStatus:
      (url.searchParams.get("paymentStatus") as OrderPaymentStatus | "all") ||
      undefined,
    refundDisputeStatus:
      (url.searchParams.get("refundDisputeStatus") as
        | RefundDisputeStatus
        | "all") || undefined,
    customerId: url.searchParams.get("customerId") ?? undefined,
    providerId: url.searchParams.get("providerId") ?? undefined,
    categoryId: url.searchParams.get("categoryId") ?? undefined,
    location: url.searchParams.get("location") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    amountMin: n("amountMin"),
    amountMax: n("amountMax"),
    testOnly: bool("testOnly"),
    sort: (url.searchParams.get("sort") as OrderHistorySort) || "newest",
    page: n("page") ?? 1,
    pageSize: n("pageSize") ?? 20,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminContext(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    );
  }

  const admin = auth.ctx.adminClient ?? auth.ctx.supabase;
  const url = new URL(request.url);
  const filters = parseFilters(url);
  const exportCsv = url.searchParams.get("export") === "csv";

  try {
    if (exportCsv) {
      const result = await listAdminOrderHistory(admin, {
        ...filters,
        page: 1,
        pageSize: 500,
      });
      const csv = orderHistoryToCsv(result.items);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="look-orders-${new Date()
            .toISOString()
            .slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const result = await listAdminOrderHistory(admin, filters);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : "Failed to load orders",
      },
      { status: 500 }
    );
  }
}
