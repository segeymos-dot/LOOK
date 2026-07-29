import { NextResponse } from "next/server";
import { recordAppHeartbeat } from "@/lib/admin/user-stats";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      visitorId?: string;
      sessionId?: string | null;
    };

    const visitorId = typeof body.visitorId === "string" ? body.visitorId.trim() : "";
    if (visitorId.length < 8 || visitorId.length > 128) {
      return NextResponse.json({ error: "Invalid visitor id" }, { status: 400 });
    }

    const sessionId =
      typeof body.sessionId === "string" && body.sessionId.length > 0
        ? body.sessionId
        : null;

    const result = await recordAppHeartbeat({ visitorId, sessionId }, request);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Heartbeat failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
