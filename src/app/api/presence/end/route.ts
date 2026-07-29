import { NextResponse } from "next/server";
import { endAppPresence } from "@/lib/admin/user-stats";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      visitorId?: string;
      sessionId?: string | null;
    };

    const visitorId = typeof body.visitorId === "string" ? body.visitorId.trim() : "";
    if (visitorId.length < 8) {
      return NextResponse.json({ ok: true });
    }

    await endAppPresence(
      {
        visitorId,
        sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
      },
      request
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
