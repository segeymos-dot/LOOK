import { listAdminDirectory } from "@/lib/admin/directory";
import { requireAdminContext } from "@/lib/admin/require-admin";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const gate = await requireAdminContext(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const sp = request.nextUrl.searchParams;
  try {
    const result = await listAdminDirectory(gate.ctx.supabase, gate.ctx.adminClient, "providers", {
      q: sp.get("q") ?? undefined,
      city: sp.get("city") ?? undefined,
      status: sp.get("status") ?? undefined,
      category: sp.get("category") ?? undefined,
      sort: sp.get("sort") ?? undefined,
      page: Number(sp.get("page") ?? "1"),
      minOrders: sp.get("minOrders") ? Number(sp.get("minOrders")) : undefined,
      minRating: sp.get("minRating") ? Number(sp.get("minRating")) : undefined,
      registeredFrom: sp.get("registeredFrom") ?? undefined,
      registeredTo: sp.get("registeredTo") ?? undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch {
    return NextResponse.json({ error: "Failed to load data" }, { status: 500 });
  }
}
