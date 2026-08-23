import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { isPlatformAdmin } from "@/lib/data/finance-actions";
import { setRequestArchived } from "@/lib/data/order-history";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  requestId: z.string().uuid(),
  archived: z.boolean(),
});

export async function POST(request: Request) {
  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid input" },
      { status: 400 }
    );
  }

  const [{ data: reqRow }, admin] = await Promise.all([
    auth.supabase
      .from("requests")
      .select("id, customer_id")
      .eq("id", parsed.data.requestId)
      .maybeSingle(),
    isPlatformAdmin(auth.supabase, auth.user.id),
  ]);

  if (!reqRow) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const { data: accepted } = await auth.supabase
    .from("offers")
    .select("provider_id")
    .eq("request_id", parsed.data.requestId)
    .eq("status", "accepted")
    .maybeSingle();

  const allowed =
    admin ||
    reqRow.customer_id === auth.user.id ||
    accepted?.provider_id === auth.user.id;

  if (!allowed) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const result = await setRequestArchived(
    auth.supabase,
    parsed.data.requestId,
    parsed.data.archived
  );
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
