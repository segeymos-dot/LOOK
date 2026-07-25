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
    const result = await listAdminDirectory(gate.ctx.supabase, gate.ctx.adminClient, "customers", {
      q: sp.get("q") ?? undefined,
      city: sp.get("city") ?? undefined,
      status: sp.get("status") ?? undefined,
      sort: sp.get("sort") ?? undefined,
      page: Number(sp.get("page") ?? "1"),
      minOrders: sp.get("minOrders") ? Number(sp.get("minOrders")) : undefined,
      registeredFrom: sp.get("registeredFrom") ?? undefined,
      registeredTo: sp.get("registeredTo") ?? undefined,
    });
    return NextResponse.json({
      success: true,
      ...result,
      emailLookupAvailable: Boolean(gate.ctx.adminClient),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load data" }, { status: 500 });
  }
}
