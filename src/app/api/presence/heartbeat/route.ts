import { NextResponse } from "next/server";
import { recordAppHeartbeat } from "@/lib/admin/user-stats";
import {
  normalizeSessionId,
  normalizeVisitorId,
} from "@/lib/admin/presence-validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      visitorId?: unknown;
      sessionId?: unknown;
      userId?: unknown;
    };

    // Reject forged identity fields — auth comes only from cookies / Bearer.
    if (body.userId != null) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const visitorId = normalizeVisitorId(body.visitorId);
    if (!visitorId) {
      return NextResponse.json({ error: "Invalid visitor id" }, { status: 400 });
    }

    const sessionId = normalizeSessionId(body.sessionId);
    if (body.sessionId != null && body.sessionId !== "" && !sessionId) {
      return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
    }

    const result = await recordAppHeartbeat({ visitorId, sessionId }, request);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Heartbeat failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
