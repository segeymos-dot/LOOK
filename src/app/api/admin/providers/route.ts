import { listAdminDirectory } from "@/lib/admin/directory";
import { listRoleActivity } from "@/lib/admin/role-activity";
import { requireAdminContext } from "@/lib/admin/require-admin";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function parseBool(v: string | null): boolean {
  return v === "1" || v === "true" || v === "yes";
}

export async function GET(request: NextRequest) {
  const gate = await requireAdminContext(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const sp = request.nextUrl.searchParams;
  if (sp.get("view") !== "activity") {
    try {
      const result = await listAdminDirectory(
        gate.ctx.supabase,
        gate.ctx.adminClient,
        "providers",
        {
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
        }
      );
      return NextResponse.json({
        success: true,
        ...result,
        emailLookupAvailable: Boolean(gate.ctx.adminClient),
      });
    } catch {
      return NextResponse.json({ error: "Failed to load data" }, { status: 500 });
    }
  }

  try {
    const result = await listRoleActivity(
      gate.ctx.supabase,
      gate.ctx.adminClient,
      "providers",
      {
        q: sp.get("q") ?? undefined,
        page: Number(sp.get("page") ?? "1"),
        pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
        sort: sp.get("sort") ?? undefined,
        onlineOnly: parseBool(sp.get("onlineOnly")),
        registeredFrom: sp.get("registeredFrom") ?? undefined,
        registeredTo: sp.get("registeredTo") ?? undefined,
        activityFrom: sp.get("activityFrom") ?? undefined,
        activityTo: sp.get("activityTo") ?? undefined,
      }
    );
    return NextResponse.json({
      success: true,
      ...result,
      emailLookupAvailable: Boolean(gate.ctx.adminClient),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
