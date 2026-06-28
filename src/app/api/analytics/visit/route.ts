import { recordSiteVisit } from "@/lib/analytics/platform-stats";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const VISITOR_COOKIE = "look_visitor";
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;

function newVisitorKey(): string {
  return crypto.randomUUID();
}

export async function POST() {
  const cookieStore = await cookies();
  let visitorKey = cookieStore.get(VISITOR_COOKIE)?.value;

  if (!visitorKey || visitorKey.length < 8) {
    visitorKey = newVisitorKey();
  }

  const admin = createAdminClient();
  if (admin) {
    await recordSiteVisit(admin, visitorKey);
  } else {
    const supabase = await createClient();
    await recordSiteVisit(supabase, visitorKey);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(VISITOR_COOKIE, visitorKey, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: VISITOR_MAX_AGE,
    path: "/",
  });

  return response;
}
