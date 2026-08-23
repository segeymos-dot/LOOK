import {
  getDemoPlatformSummary,
  getDemoTransactionsForUser,
} from "@/lib/mock/finance";
import { isDemoMode } from "@/lib/config";
import { getTransactions, isPlatformAdmin } from "@/lib/data/finance-actions";
import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { resolveTransactionViewerScope } from "@/lib/finance/transaction-visibility";
import type { UserRole } from "@/types";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 30);
  const requestedScope = url.searchParams.get("scope");

  if (isDemoMode()) {
    const userId = url.searchParams.get("userId") ?? "user-1";
    const isAdmin = url.searchParams.get("admin") === "1";
    const resolved = resolveTransactionViewerScope({
      requestedScope,
      isAdmin,
      role: (url.searchParams.get("role") as UserRole | null) ?? "customer",
    });
    if (!resolved.ok) {
      return NextResponse.json(
        { success: false, error: resolved.error },
        { status: resolved.status }
      );
    }
    return NextResponse.json({
      success: true,
      transactions: getDemoTransactionsForUser(userId, isAdmin, resolved.scope),
      summary: isAdmin ? getDemoPlatformSummary() : undefined,
      scope: resolved.scope,
      viewer: resolved.viewer,
      isAdmin,
    });
  }

  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const admin = await isPlatformAdmin(auth.supabase, auth.user.id);
  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();

  const resolved = resolveTransactionViewerScope({
    requestedScope,
    isAdmin: admin,
    role: (profile?.role as UserRole | null) ?? null,
  });

  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: resolved.error },
      { status: resolved.status }
    );
  }

  const transactions = await getTransactions(auth.supabase, {
    limit,
    scope: resolved.scope,
    userId: auth.user.id,
  });

  return NextResponse.json({
    success: true,
    transactions,
    scope: resolved.scope,
    viewer: resolved.viewer,
    isAdmin: admin,
  });
}
