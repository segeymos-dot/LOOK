import { requireAdminContext } from "@/lib/admin/require-admin";
import { listAdminDisputes } from "@/lib/admin/disputes";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requireAdminContext(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const admin = auth.ctx.adminClient ?? auth.ctx.supabase;
  const url = new URL(request.url);

  try {
    const { items, total } = await listAdminDisputes(admin, {
      status: url.searchParams.get("status") ?? "all",
      q: url.searchParams.get("q") ?? undefined,
      customerId: url.searchParams.get("customerId") ?? undefined,
      providerId: url.searchParams.get("providerId") ?? undefined,
      requestId: url.searchParams.get("requestId") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 20),
    });
    return NextResponse.json({ success: true, items, total });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to load disputes" },
      { status: 500 }
    );
  }
}
