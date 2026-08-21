import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminSupportMessage,
  AdminSupportMessageWithUser,
  AdminSupportStatus,
  AdminSupportUserRole,
} from "@/lib/support/types";

export const createSupportMessageSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, { message: "subject_required" })
    .max(200, { message: "subject_too_long" }),
  message: z
    .string()
    .trim()
    .min(1, { message: "message_required" })
    .max(5000, { message: "message_too_long" }),
  userRole: z.enum(["customer", "provider"]),
  language: z.enum(["ru", "en"]).default("ru"),
});

export async function insertSupportMessage(
  supabase: SupabaseClient,
  input: {
    userId: string;
    userRole: AdminSupportUserRole;
    subject: string;
    message: string;
    language: "ru" | "en";
  }
): Promise<{ data: AdminSupportMessage | null; error: string | null }> {
  const { data, error } = await supabase
    .from("admin_support_messages")
    .insert({
      user_id: input.userId,
      user_role: input.userRole,
      subject: input.subject,
      message: input.message,
      language: input.language,
      status: "new",
    })
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: data as AdminSupportMessage, error: null };
}

export async function listSupportMessagesForAdmin(
  supabase: SupabaseClient
): Promise<{ data: AdminSupportMessageWithUser[]; error: string | null }> {
  const { data, error } = await supabase
    .from("admin_support_messages")
    .select(
      "id, user_id, user_role, subject, message, language, status, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return { data: [], error: error.message };
  }

  const rows = (data ?? []) as AdminSupportMessage[];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  let nameById = new Map<string, string | null>();

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    nameById = new Map(
      (profiles ?? []).map((p) => [p.id as string, (p.full_name as string) ?? null])
    );
  }

  return {
    data: rows.map((row) => ({
      ...row,
      user: {
        id: row.user_id,
        full_name: nameById.get(row.user_id) ?? null,
      },
    })),
    error: null,
  };
}

export async function getSupportMessageForAdmin(
  supabase: SupabaseClient,
  id: string
): Promise<{ data: AdminSupportMessageWithUser | null; error: string | null }> {
  const { data, error } = await supabase
    .from("admin_support_messages")
    .select(
      "id, user_id, user_role, subject, message, language, status, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }
  if (!data) {
    return { data: null, error: null };
  }

  const row = data as AdminSupportMessage;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", row.user_id)
    .maybeSingle();

  return {
    data: {
      ...row,
      user: {
        id: row.user_id,
        full_name: (profile?.full_name as string | null) ?? null,
      },
    },
    error: null,
  };
}

export async function updateSupportMessageStatus(
  supabase: SupabaseClient,
  id: string,
  status: AdminSupportStatus
): Promise<{ data: AdminSupportMessage | null; error: string | null }> {
  const { data, error } = await supabase
    .from("admin_support_messages")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: data as AdminSupportMessage, error: null };
}
