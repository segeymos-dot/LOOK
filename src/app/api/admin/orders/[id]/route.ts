import { getAdminOrderDetail, getAdminOrderMessages } from "@/lib/admin/order-detail";
import { requireAdminContext } from "@/lib/admin/require-admin";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminContext(request);
  if (!gate.ok) {
    return NextResponse.json(
      { success: false, error: gate.error },
      { status: gate.status }
    );
  }

  const admin = gate.ctx.adminClient;
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Admin client unavailable" },
      { status: 500 }
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { success: false, error: "Missing order id" },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const wantMessages = url.searchParams.get("messages") === "1";

  try {
    if (wantMessages) {
      const before = url.searchParams.get("before") ?? undefined;
      const limitRaw = Number(url.searchParams.get("limit") ?? "50");
      const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
      const messages = await getAdminOrderMessages(admin, id, { before, limit });
      if (!messages) {
        return NextResponse.json(
          { success: false, error: "Not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, messages });
    }

    const detail = await getAdminOrderDetail(admin, id);
    if (!detail) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, detail });
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : "Failed to load order",
      },
      { status: 500 }
    );
  }
}
