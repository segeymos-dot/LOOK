import {
  listCustomerOrderHistory,
  listProviderOrderHistory,
} from "@/lib/data/order-history";
import { canActAsCustomer, canActAsProvider } from "@/lib/auth/roles";
import { isPlatformAdmin } from "@/lib/data/finance-actions";
import { getFinanceApiUser } from "@/lib/api/finance-auth";
import type { OrderHistoryFilters, OrderHistorySort, OrderHistoryTab } from "@/lib/orders/history-types";
import type {
  OfferStatus,
  OrderPaymentStatus,
  RefundDisputeStatus,
  RequestStatus,
  UserRole,
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
    offerStatus:
      (url.searchParams.get("offerStatus") as OfferStatus | "all") || undefined,
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
  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const viewer = (url.searchParams.get("viewer") || "auto") as
    | "customer"
    | "provider"
    | "admin"
    | "auto";
  const filters = parseFilters(url);

  const [{ data: profile }, admin] = await Promise.all([
    auth.supabase
      .from("profiles")
      .select("role, is_platform_admin")
      .eq("id", auth.user.id)
      .maybeSingle(),
    isPlatformAdmin(auth.supabase, auth.user.id),
  ]);

  const role = (profile?.role as UserRole | null) ?? null;

  let resolved: "customer" | "provider" | "admin";
  if (viewer === "admin") {
    if (!admin) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    resolved = "admin";
  } else if (viewer === "provider") {
    if (!canActAsProvider(role) && !admin) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    resolved = "provider";
  } else if (viewer === "customer") {
    if (!canActAsCustomer(role) && !admin) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    resolved = "customer";
  } else {
    if (admin) resolved = "admin";
    else if (canActAsCustomer(role)) resolved = "customer";
    else if (canActAsProvider(role)) resolved = "provider";
    else {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
  }

  if (resolved === "admin") {
    // Admin list goes through dedicated admin route with service role.
    return NextResponse.json(
      { success: false, error: "Use /api/admin/orders" },
      { status: 400 }
    );
  }

  const result =
    resolved === "provider"
      ? await listProviderOrderHistory(auth.supabase, auth.user.id, filters)
      : await listCustomerOrderHistory(auth.supabase, auth.user.id, filters);

  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error, viewer: resolved },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    viewer: resolved,
    userId: auth.user.id,
    ...result,
  });
}
