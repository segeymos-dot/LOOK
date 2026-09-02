import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

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
  source?: string | null;
  locale?: string | null;
  intent?: string | null;
};

export type WebsiteInquiryReply = {
  id: string;
  inquiry_id: string;
  message: string;
  created_at: string;
  locale: string | null;
};

const MAX = {
  name: 120,
  email: 254,
  subject: 200,
  message: 5000,
  intent: 40,
  locale: 8,
} as const;

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= MAX.email;
}

export function fingerprintInquiry(input: {
  email: string;
  subject: string;
  message: string;
}): string {
  return createHash("sha256")
    .update(
      `${input.email.trim().toLowerCase()}|${input.subject.trim()}|${input.message.trim()}`
    )
    .digest("hex")
    .slice(0, 32);
}

export type CreateWebsiteInquiryInput = {
  name: string;
  email: string;
  subject: string;
  message: string;
  intent?: string | null;
  locale?: string | null;
  source?: string;
};

export async function createWebsiteInquiry(
  input: CreateWebsiteInquiryInput
): Promise<{ id: string } | { error: string; status: number }> {
  const name = input.name.trim().slice(0, MAX.name);
  const email = input.email.trim().toLowerCase().slice(0, MAX.email);
  const subject = input.subject.trim().slice(0, MAX.subject);
  const message = input.message.trim().slice(0, MAX.message);
  const intent = (input.intent ?? "").trim().slice(0, MAX.intent) || null;
  const locale = (input.locale ?? "").trim().slice(0, MAX.locale) || null;
  const source = (input.source ?? "website_contact").trim().slice(0, 40);

  if (!email || !message) {
    return { error: "Email and message are required", status: 400 };
  }
  if (!isValidEmail(email)) {
    return { error: "Invalid email", status: 400 };
  }
  if (!name || !subject) {
    return { error: "Missing required fields", status: 400 };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { error: "Server misconfigured", status: 503 };
  }

  const fingerprint = fingerprintInquiry({ email, subject, message });

  // Prefer SECURITY DEFINER RPC (works even if client role is wrong).
  const { data: rpcId, error: rpcError } = await admin.rpc(
    "ingest_website_inquiry",
    {
      p_name: name,
      p_email: email,
      p_subject: subject,
      p_message: message,
      p_intent: intent,
      p_locale: locale,
      p_source: source,
      p_fingerprint: fingerprint,
    }
  );

  if (!rpcError && rpcId) {
    return { id: String(rpcId) };
  }

  // Double-submit window (~2 minutes) via direct select.
  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: existing } = await admin
    .from("website_inquiries")
    .select("id")
    .eq("content_fingerprint", fingerprint)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return { id: existing.id };
  }

  const { data, error } = await admin
    .from("website_inquiries")
    .insert({
      name,
      email,
      subject,
      message,
      intent,
      locale,
      source,
      status: "new",
      read_by_admin_at: null,
      answered_at: null,
      content_fingerprint: fingerprint,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return {
      error: error?.message || rpcError?.message || "Failed to save inquiry",
      status: 500,
    };
  }
  return { id: data.id };
}

/** Unread = read_by_admin_at IS NULL. Separate from in-app support unread. */
export async function countWebsiteInquiriesUnread(
  supabase: import("@supabase/supabase-js").SupabaseClient
): Promise<{ count: number; error: string | null }> {
  const { data, error } = await supabase.rpc(
    "get_admin_website_inquiries_unread_count"
  );
  if (!error) {
    return { count: Number(data) || 0, error: null };
  }

  if (
    /does not exist|schema cache|42P01|Could not find the function/i.test(
      error.message
    )
  ) {
    return { count: 0, error: null };
  }

  const { count, error: countError } = await supabase
    .from("website_inquiries")
    .select("id", { count: "exact", head: true })
    .is("read_by_admin_at", null);

  if (countError) {
    if (/does not exist|schema cache|42P01/i.test(countError.message)) {
      return { count: 0, error: null };
    }
    return { count: 0, error: countError.message || error.message };
  }
  return { count: count ?? 0, error: null };
}

export async function listWebsiteInquiries(
  supabase: import("@supabase/supabase-js").SupabaseClient
): Promise<{ inquiries: WebsiteInquiry[]; error: string | null }> {
  const { data, error } = await supabase
    .from("website_inquiries")
    .select(
      "id, name, email, subject, message, created_at, status, read_by_admin_at, answered_at, source, locale, intent"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
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

export async function getWebsiteInquiry(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  id: string
): Promise<{ inquiry: WebsiteInquiry | null; error: string | null }> {
  const { data, error } = await supabase
    .from("website_inquiries")
    .select(
      "id, name, email, subject, message, created_at, status, read_by_admin_at, answered_at, source, locale, intent"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return { inquiry: null, error: error.message };
  return { inquiry: (data as WebsiteInquiry) ?? null, error: null };
}

export async function markWebsiteInquiryRead(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  id: string
): Promise<{ inquiry: WebsiteInquiry | null; error: string | null }> {
  const { data, error } = await supabase.rpc("mark_website_inquiry_read", {
    p_inquiry_id: id,
  });
  if (!error && data) {
    return { inquiry: data as WebsiteInquiry, error: null };
  }

  // Fallback without RPC.
  const { data: row, error: updError } = await supabase
    .from("website_inquiries")
    .update({
      read_by_admin_at: new Date().toISOString(),
      status: "read",
    })
    .eq("id", id)
    .is("read_by_admin_at", null)
    .select(
      "id, name, email, subject, message, created_at, status, read_by_admin_at, answered_at, source, locale, intent"
    )
    .maybeSingle();

  if (updError) {
    // Already read — fetch current.
    return getWebsiteInquiry(supabase, id);
  }
  if (row) return { inquiry: row as WebsiteInquiry, error: null };
  return getWebsiteInquiry(supabase, id);
}

export async function listWebsiteInquiryReplies(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  inquiryId: string
): Promise<{ replies: WebsiteInquiryReply[]; error: string | null }> {
  const { data, error } = await supabase
    .from("website_inquiry_replies")
    .select("id, inquiry_id, message, created_at, locale")
    .eq("inquiry_id", inquiryId)
    .order("created_at", { ascending: true });

  if (error) {
    if (/does not exist|schema cache|42P01/i.test(error.message)) {
      return { replies: [], error: null };
    }
    return { replies: [], error: error.message };
  }
  return { replies: (data ?? []) as WebsiteInquiryReply[], error: null };
}
