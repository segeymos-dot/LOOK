import { NextResponse } from "next/server";
import { endAppPresence } from "@/lib/admin/user-stats";
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

    if (body.userId != null) {
      return NextResponse.json({ ok: true });
    }

    const visitorId = normalizeVisitorId(body.visitorId);
    if (!visitorId) {
      return NextResponse.json({ ok: true });
    }

    const sessionId = normalizeSessionId(body.sessionId);

    await endAppPresence({ visitorId, sessionId }, request);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
