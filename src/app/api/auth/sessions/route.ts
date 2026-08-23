import {
  listAccountSessions,
  registerCurrentSession,
  revokeAccountSession,
  revokeAllAccountSessions,
} from "@/lib/auth/account-sessions";
import { decodeAccessTokenClaims } from "@/lib/auth/session-meta";
import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { getClientIp } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const claims = decodeAccessTokenClaims(token);
  const currentId = claims?.session_id ?? null;

  // Touch / register current session on list.
  if (token && currentId) {
    await registerCurrentSession(auth.supabase, {
      userId: auth.user.id,
      accessToken: token,
      userAgent: request.headers.get("user-agent"),
      ip: getClientIp(request),
    });
  }

  const sessions = await listAccountSessions(
    auth.supabase,
    auth.user.id,
    currentId
  );

  return NextResponse.json({
    success: true,
    sessions,
    currentAuthSessionId: currentId,
  });
}

export async function DELETE(request: Request) {
  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as {
    authSessionId?: string;
    all?: boolean;
    includeCurrent?: boolean;
  };

  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const claims = decodeAccessTokenClaims(token);
  const currentId = claims?.session_id ?? null;

  if (body.all) {
    const result = await revokeAllAccountSessions(
      auth.supabase,
      auth.user.id,
      currentId,
      { includeCurrent: Boolean(body.includeCurrent) }
    );
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true, revoked: "all" });
  }

  if (!body.authSessionId) {
    return NextResponse.json(
      { success: false, error: "authSessionId required" },
      { status: 400 }
    );
  }

  if (currentId && body.authSessionId === currentId) {
    return NextResponse.json(
      { success: false, error: "Use sign-out for the current session" },
      { status: 400 }
    );
  }

  const result = await revokeAccountSession(
    auth.supabase,
    auth.user.id,
    body.authSessionId
  );
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, revoked: body.authSessionId });
}
