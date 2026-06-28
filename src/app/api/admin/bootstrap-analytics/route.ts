import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/data/finance-actions";
import { fetchPlatformStats, recordSiteVisit } from "@/lib/analytics/platform-stats";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminUser = await isPlatformAdmin(supabase, user.id);
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = createAdminClient();
  if (!service) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured" },
      { status: 503 }
    );
  }

  const recorded = await recordSiteVisit(service, "bootstrap-admin-visit-key");
  const stats = await fetchPlatformStats(supabase);

  return NextResponse.json({
    ok: true,
    recorded,
    stats,
  });
}
