import { NextResponse, type NextRequest } from "next/server";
import { requireAdminContext } from "@/lib/admin/require-admin";

export const dynamic = "force-dynamic";

/**
 * Soft-trash a request as platform admin.
 * Prefers service-role update; falls back to admin_soft_trash_request RPC (migration 052).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminContext(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await context.params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid request id" }, { status: 400 });
  }

  try {
    const admin = gate.ctx.adminClient;
    if (admin) {
      const { data, error } = await admin
        .from("requests")
        .update({ trashed_at: new Date().toISOString() })
        .eq("id", id)
        .is("trashed_at", null)
        .select("id, trashed_at")
        .maybeSingle();

      if (error) {
        console.error("[admin trash] service-role update", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (data) {
        return NextResponse.json({ success: true, via: "service_role", request: data });
      }

      const { data: existing } = await admin
        .from("requests")
        .select("id, trashed_at")
        .eq("id", id)
        .maybeSingle();

      if (existing?.trashed_at) {
        return NextResponse.json({
          success: true,
          via: "service_role",
          already_trashed: true,
          request: existing,
        });
      }

      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const { data, error } = await gate.ctx.supabase.rpc("admin_soft_trash_request", {
      p_request_id: id,
    });

    if (error) {
      console.error("[admin trash] rpc", error.message);
      return NextResponse.json(
        {
          error: error.message,
          hint: "Apply migration 052 or set SUPABASE_SERVICE_ROLE_KEY",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, via: "rpc", result: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Trash failed";
    console.error("[admin trash]", message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
