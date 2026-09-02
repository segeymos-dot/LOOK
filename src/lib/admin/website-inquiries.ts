import type { SupabaseClient } from "@supabase/supabase-js";

export type WebsiteInquiry = {
  id: string;
  name: string | null;
  email: string | null;
  subject: string | null;
  message: string;
  created_at: string;
  status: string;
  read_by_admin_at: string | null;
  answered_at: string | null;
};

/** Unread = read_by_admin_at IS NULL. Separate from in-app support unread. */
export async function countWebsiteInquiriesUnread(
  supabase: SupabaseClient
): Promise<{ count: number; error: string | null }> {
  const { data, error } = await supabase.rpc(
    "get_admin_website_inquiries_unread_count"
  );
  if (!error) {
    return { count: Number(data) || 0, error: null };
  }

  if (/does not exist|schema cache|42P01|Could not find the function/i.test(error.message)) {
    // Migration not applied yet — treat as zero, no fake rows.
    return { count: 0, error: null };
  }

  // Fallback direct count if RPC missing but table exists.
  const { count, error: countError } = await supabase
    .from("website_inquiries")
    .select("id", { count: "exact", head: true })
    .is("read_by_admin_at", null);

  if (countError) {
    if (/does not exist|schema cache|42P01/i.test(countError.message || error.message)) {
      return { count: 0, error: null };
    }
    return { count: 0, error: countError.message || error.message };
  }
  return { count: count ?? 0, error: null };
}

export async function listWebsiteInquiries(
  supabase: SupabaseClient
): Promise<{ inquiries: WebsiteInquiry[]; error: string | null }> {
  const { data, error } = await supabase
    .from("website_inquiries")
    .select(
      "id, name, email, subject, message, created_at, status, read_by_admin_at, answered_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    // Table missing → empty list (structure ready, no fake rows).
    if (/does not exist|schema cache|42P01/i.test(error.message)) {
      return { inquiries: [], error: null };
    }
    return { inquiries: [], error: error.message };
  }

  return {
    inquiries: (data ?? []) as WebsiteInquiry[],
    error: null,
  };
}
