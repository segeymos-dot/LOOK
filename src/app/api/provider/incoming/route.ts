import { canActAsProvider } from "@/lib/auth/roles";
import {
  countPendingIncomingDirected,
  fetchIncomingDirectedRequests,
} from "@/lib/data/incoming-directed-requests";
import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const accessToken = request.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAuthenticatedClient(accessToken);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !canActAsProvider(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const countOnly = url.searchParams.get("countOnly") === "1";

  if (countOnly) {
    const pendingCount = await countPendingIncomingDirected(supabase, user.id);
    return NextResponse.json({ pendingCount });
  }

  const items = await fetchIncomingDirectedRequests(supabase, user.id);
  const pendingCount = items.filter((i) => i.inbox_status === "new").length;

  return NextResponse.json({ items, pendingCount });
}
