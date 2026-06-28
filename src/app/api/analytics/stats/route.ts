import { fetchPlatformStats } from "@/lib/analytics/platform-stats";
import { isPlatformAdmin } from "@/lib/data/finance-actions";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

async function getAuthedSupabase(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) return { supabase, user };

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!token) return { supabase, user: null };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { supabase, user: null };

  const bearerClient = createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user: bearerUser },
  } = await bearerClient.auth.getUser(token);

  return { supabase: bearerClient, user: bearerUser };
}

export async function GET(request: Request) {
  const { supabase, user } = await getAuthedSupabase(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await isPlatformAdmin(supabase, user.id);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stats = await fetchPlatformStats(supabase);
  return NextResponse.json({ stats });
}
