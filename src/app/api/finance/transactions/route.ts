import {
  getDemoPlatformSummary,
  getDemoTransactionsForUser,
} from "@/lib/mock/finance";
import { isDemoMode } from "@/lib/config";
import { getTransactions, isPlatformAdmin } from "@/lib/data/finance-actions";
import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 30);

  if (isDemoMode()) {
    const userId = new URL(request.url).searchParams.get("userId") ?? "user-1";
    const isAdmin = new URL(request.url).searchParams.get("admin") === "1";
    return NextResponse.json({
      success: true,
      transactions: getDemoTransactionsForUser(userId, isAdmin),
      summary: isAdmin ? getDemoPlatformSummary() : undefined,
    });
  }

  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const transactions = await getTransactions(auth.supabase, limit);
  const admin = await isPlatformAdmin(auth.supabase, auth.user.id);

  return NextResponse.json({
    success: true,
    transactions,
    isAdmin: admin,
  });
}
