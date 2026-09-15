import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { isPlatformAdmin } from "@/lib/data/finance-actions";
import {
  canMarkOrderAsTest,
  prodSafeTestDeniedJson,
} from "@/lib/payments/test-payments-guard";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/** Mark an owned open/in-progress unpaid order as is_test (allowlisted emails only). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const admin = await isPlatformAdmin(auth.supabase, auth.user.id);
  if (!canMarkOrderAsTest({ email: auth.user.email, isPlatformAdmin: admin })) {
    return NextResponse.json(prodSafeTestDeniedJson(), { status: 403 });
  }

  const { data, error } = await auth.supabase.rpc("set_request_is_test", {
    p_request_id: requestId,
    p_is_test: true,
  });

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath(`/requests/${requestId}/payment`);
  revalidatePath("/orders");
  revalidatePath("/search");

  return NextResponse.json({ success: true, ...(data as object) });
}
