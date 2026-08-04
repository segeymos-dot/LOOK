import { cancelOrderSafe } from "@/lib/data/cancel-refund-actions";
import { isPlatformAdmin } from "@/lib/data/finance-actions";
import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const accessToken = request.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!accessToken) {
    return NextResponse.json(
      { success: false, error: "Необходима авторизация" },
      { status: 401 }
    );
  }

  const supabase = createAuthenticatedClient(accessToken);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Необходима авторизация" },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  const admin = await isPlatformAdmin(supabase, user.id);
  const result = await cancelOrderSafe(supabase, id, user, {
    reason: reason || undefined,
    isPlatformAdmin: admin,
  });

  if (!result.success) {
    const status =
      result.code === "TEST_PAYMENTS_DISABLED" || result.code === "TEST_ACTOR_DENIED"
        ? 403
        : 400;
    return NextResponse.json(result, { status });
  }

  revalidatePath("/");
  revalidatePath("/search");
  revalidatePath("/my/requests");
  revalidatePath(`/requests/${id}`);
  revalidatePath("/finance/transactions");
  revalidatePath("/my/balance");
  revalidatePath("/admin/stats");

  return NextResponse.json(result);
}
