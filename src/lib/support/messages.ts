import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AdminSupportSenderType,
  AdminSupportStatus,
  AdminSupportThreadMessage,
  AdminSupportTicket,
  AdminSupportTicketDetail,
  AdminSupportTicketListItem,
  AdminSupportUserInfo,
  AdminSupportUserRole,
} from "@/lib/support/types";

const TICKET_COLUMNS =
  "id, user_id, user_role, subject, message, language, status, created_at, updated_at, last_activity_at, admin_last_read_at, user_last_read_at";

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
  idempotencyKey: z.string().trim().max(120).optional(),
});

export const supportReplySchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, { message: "message_required" })
    .max(5000, { message: "message_too_long" }),
  language: z.enum(["ru", "en"]).default("ru"),
});

function asTicket(row: Record<string, unknown>): AdminSupportTicket {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    user_role: row.user_role as AdminSupportUserRole,
    subject: String(row.subject),
    message: String(row.message),
    language: row.language as AdminSupportTicket["language"],
    status: row.status as AdminSupportStatus,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    last_activity_at: String(
      row.last_activity_at ?? row.updated_at ?? row.created_at
    ),
    admin_last_read_at: row.admin_last_read_at
      ? String(row.admin_last_read_at)
      : null,
    user_last_read_at: row.user_last_read_at
      ? String(row.user_last_read_at)
      : null,
  };
}

function asThreadMessage(row: Record<string, unknown>): AdminSupportThreadMessage {
  return {
    id: String(row.id),
    ticket_id: String(row.ticket_id),
    sender_type: row.sender_type as AdminSupportSenderType,
    sender_user_id: row.sender_user_id ? String(row.sender_user_id) : null,
    message: String(row.message),
    language: row.language as AdminSupportThreadMessage["language"],
    created_at: String(row.created_at),
  };
}

/** Unread when the other party sent the latest activity after the viewer's cursor. */
function unreadFromThread(
  ticket: AdminSupportTicket,
  lastSender: AdminSupportSenderType | null,
  viewer: "admin" | "user"
): boolean {
  if (viewer === "admin") {
    if (ticket.status === "new") return true;
    if (lastSender === "user") {
      if (!ticket.admin_last_read_at) return true;
      return (
        new Date(ticket.last_activity_at).getTime() >
        new Date(ticket.admin_last_read_at).getTime()
      );
    }
    return false;
  }
  if (lastSender === "admin") {
    if (!ticket.user_last_read_at) return true;
    return (
      new Date(ticket.last_activity_at).getTime() >
      new Date(ticket.user_last_read_at).getTime()
    );
  }
  return false;
}

async function loadProfiles(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<
  Map<
    string,
    {
      full_name: string | null;
      created_at: string | null;
      is_platform_admin: boolean;
      role: string | null;
    }
  >
> {
  const map = new Map<
    string,
    {
      full_name: string | null;
      created_at: string | null;
      is_platform_admin: boolean;
      role: string | null;
    }
  >();
  if (userIds.length === 0) return map;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, created_at, is_platform_admin, role")
    .in("id", userIds);
  for (const p of data ?? []) {
    map.set(p.id as string, {
      full_name: (p.full_name as string | null) ?? null,
      created_at: (p.created_at as string | null) ?? null,
      is_platform_admin: Boolean(p.is_platform_admin),
      role: (p.role as string | null) ?? null,
    });
  }
  return map;
}

async function loadEmails(
  userIds: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const admin = createAdminClient();
  if (!admin || userIds.length === 0) return map;

  // Cap + short timeout: Auth Admin API must never hang support detail/list.
  const ids = userIds.slice(0, 20);
  const lookups = Promise.all(
    ids.map(async (id) => {
      try {
        const { data, error } = await admin.auth.admin.getUserById(id);
        if (error || !data.user) {
          map.set(id, null);
          return;
        }
        map.set(id, data.user.email ?? null);
      } catch {
        map.set(id, null);
      }
    })
  );

  await Promise.race([
    lookups,
    new Promise<void>((resolve) => setTimeout(resolve, 1500)),
  ]);
  return map;
}

async function loadLastThreadMeta(
  supabase: SupabaseClient,
  ticketIds: string[]
): Promise<
  Map<string, { message: string; sender_type: AdminSupportSenderType }>
> {
  const map = new Map<
    string,
    { message: string; sender_type: AdminSupportSenderType }
  >();
  if (ticketIds.length === 0) return map;

  const { data, error } = await supabase
    .from("admin_support_thread_messages")
    .select("ticket_id, message, sender_type, created_at")
    .in("ticket_id", ticketIds)
    .order("created_at", { ascending: false });

  if (error || !data) return map;

  for (const row of data) {
    const ticketId = String(row.ticket_id);
    if (map.has(ticketId)) continue;
    map.set(ticketId, {
      message: String(row.message),
      sender_type: row.sender_type as AdminSupportSenderType,
    });
  }
  return map;
}

async function loadThread(
  supabase: SupabaseClient,
  ticketId: string
): Promise<{ data: AdminSupportThreadMessage[]; error: string | null }> {
  const { data, error } = await supabase
    .from("admin_support_thread_messages")
    .select("id, ticket_id, sender_type, sender_user_id, message, language, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (error) return { data: [], error: error.message };
  return {
    data: (data ?? []).map((row) => asThreadMessage(row as Record<string, unknown>)),
    error: null,
  };
}

/**
 * After ticket access is authorized, load the full thread.
 * Prefer service-role so RLS never hides admin rows from the ticket owner.
 */
async function loadThreadAuthorized(
  userClient: SupabaseClient,
  ticketId: string
): Promise<{ data: AdminSupportThreadMessage[]; error: string | null }> {
  const admin = createAdminClient();
  if (admin) {
    const privileged = await loadThread(admin, ticketId);
    if (!privileged.error) return privileged;
    console.warn(
      "[support] privileged thread load failed, falling back to user client:",
      privileged.error
    );
  }
  return loadThread(userClient, ticketId);
}

export async function insertSupportMessage(
  supabase: SupabaseClient,
  input: {
    userId: string;
    userRole: AdminSupportUserRole;
    subject: string;
    message: string;
    language: "ru" | "en";
    idempotencyKey?: string | null;
  }
): Promise<{ data: AdminSupportTicket | null; error: string | null }> {
  const idempotencyKey =
    input.idempotencyKey?.trim() ||
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // Prefer atomic RPC (ticket + first thread message in one transaction).
  const rpc = await supabase.rpc("create_admin_support_ticket", {
    p_user_role: input.userRole,
    p_subject: input.subject,
    p_message: input.message,
    p_language: input.language,
    p_idempotency_key: idempotencyKey,
  });

  if (!rpc.error && rpc.data) {
    return {
      data: asTicket(rpc.data as Record<string, unknown>),
      error: null,
    };
  }

  if (rpc.error) {
    console.warn(
      "[support] create_admin_support_ticket RPC unavailable, fallback insert:",
      rpc.error.message
    );
  }

  // Fallback: recent duplicate window, then insert ticket + thread message.
  const windowStart = new Date(Date.now() - 15_000).toISOString();
  const { data: recent } = await supabase
    .from("admin_support_messages")
    .select(TICKET_COLUMNS)
    .eq("user_id", input.userId)
    .eq("subject", input.subject)
    .eq("message", input.message)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (recent) {
    return { data: asTicket(recent as Record<string, unknown>), error: null };
  }

  const now = new Date().toISOString();
  const { data: ticket, error } = await supabase
    .from("admin_support_messages")
    .insert({
      user_id: input.userId,
      user_role: input.userRole,
      subject: input.subject,
      message: input.message,
      language: input.language,
      status: "new",
      last_activity_at: now,
      user_last_read_at: now,
      admin_last_read_at: null,
    })
    .select(TICKET_COLUMNS)
    .single();

  if (error || !ticket) {
    console.error("[support] ticket insert failed", error?.message);
    return { data: null, error: error?.message ?? "insert_failed" };
  }

  const ticketRow = asTicket(ticket as Record<string, unknown>);

  const { error: threadError } = await supabase
    .from("admin_support_thread_messages")
    .insert({
      ticket_id: ticketRow.id,
      sender_type: "user",
      sender_user_id: input.userId,
      message: input.message,
      language: input.language,
      created_at: ticketRow.created_at,
    });

  if (threadError) {
    console.error("[support] thread insert failed", threadError.message);
    // Best-effort cleanup so admin list does not show empty-shell tickets.
    await supabase.from("admin_support_messages").delete().eq("id", ticketRow.id);
    return { data: null, error: threadError.message };
  }

  return { data: ticketRow, error: null };
}

export async function listSupportTicketsForAdmin(
  supabase: SupabaseClient
): Promise<{ data: AdminSupportTicketListItem[]; error: string | null }> {
  const { data, error } = await supabase
    .from("admin_support_messages")
    .select(TICKET_COLUMNS)
    .order("last_activity_at", { ascending: false })
    .limit(200);

  if (error) {
    return { data: [], error: error.message };
  }

  const rows = (data ?? []).map((row) => asTicket(row as Record<string, unknown>));
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const [profiles, lastMeta] = await Promise.all([
    loadProfiles(supabase, userIds),
    loadLastThreadMeta(
      supabase,
      rows.map((r) => r.id)
    ),
  ]);

  // Only real registered non-admin owners with an existing profile/auth identity.
  // Do not hardcode names — new customers/providers appear automatically.
  const visible = rows.filter((ticket) => {
    const profile = profiles.get(ticket.user_id);
    if (!profile) return false;
    if (profile.is_platform_admin) return false;
    return true;
  });

  // Emails are optional and can hang Auth Admin API — load only on detail.
  const emails = new Map<string, string | null>();

  return {
    data: visible.map((ticket) => {
      const meta = lastMeta.get(ticket.id);
      const lastSender = meta?.sender_type ?? "user";
      const profile = profiles.get(ticket.user_id);
      return {
        ...ticket,
        last_message: meta?.message ?? ticket.message,
        last_sender_type: meta?.sender_type ?? null,
        unread: unreadFromThread(ticket, lastSender, "admin"),
        user: {
          id: ticket.user_id,
          full_name: profile?.full_name ?? null,
          email: emails.get(ticket.user_id) ?? null,
          registered_at: profile?.created_at ?? null,
        },
      };
    }),
    error: null,
  };
}

/** @deprecated alias */
export const listSupportMessagesForAdmin = listSupportTicketsForAdmin;

export async function listSupportTicketsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: AdminSupportTicketListItem[]; error: string | null }> {
  const { data, error } = await supabase
    .from("admin_support_messages")
    .select(TICKET_COLUMNS)
    .eq("user_id", userId)
    .order("last_activity_at", { ascending: false })
    .limit(100);

  if (error) {
    return { data: [], error: error.message };
  }

  const rows = (data ?? []).map((row) => asTicket(row as Record<string, unknown>));
  const lastMeta = await loadLastThreadMeta(
    supabase,
    rows.map((r) => r.id)
  );

  return {
    data: rows.map((ticket) => {
      const meta = lastMeta.get(ticket.id);
      const lastSender = meta?.sender_type ?? null;
      return {
        ...ticket,
        last_message: meta?.message ?? ticket.message,
        last_sender_type: lastSender,
        unread: unreadFromThread(ticket, lastSender, "user"),
        user: {
          id: ticket.user_id,
          full_name: null,
          email: null,
          registered_at: null,
        },
      };
    }),
    error: null,
  };
}

export async function getSupportTicketDetail(
  supabase: SupabaseClient,
  id: string,
  opts: { viewer: "admin" | "user"; userId?: string; includeEmail?: boolean }
): Promise<{ data: AdminSupportTicketDetail | null; error: string | null }> {
  let query = supabase
    .from("admin_support_messages")
    .select(TICKET_COLUMNS)
    .eq("id", id);

  if (opts.viewer === "user") {
    if (!opts.userId) {
      return { data: null, error: "user_required" };
    }
    query = query.eq("user_id", opts.userId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };

  const ticket = asTicket(data as Record<string, unknown>);
  // Ownership/admin access already enforced by the ticket SELECT above.
  // Load ALL messages for this ticket_id (user + admin), never filter by sender.
  const thread = await loadThreadAuthorized(supabase, id);
  if (thread.error) return { data: null, error: thread.error };

  const lastSender =
    thread.data.length > 0
      ? thread.data[thread.data.length - 1]!.sender_type
      : null;

  let userInfo: AdminSupportUserInfo = {
    id: ticket.user_id,
    full_name: null,
    email: null,
    registered_at: null,
  };

  if (opts.viewer === "admin") {
    const profiles = await loadProfiles(supabase, [ticket.user_id]);
    const profile = profiles.get(ticket.user_id);
    if (!profile || profile.is_platform_admin) {
      return { data: null, error: null };
    }
    const emails = opts.includeEmail
      ? await loadEmails([ticket.user_id])
      : new Map();
    userInfo = {
      id: ticket.user_id,
      full_name: profile.full_name ?? null,
      email: emails.get(ticket.user_id) ?? null,
      registered_at: profile.created_at ?? null,
    };
  }

  return {
    data: {
      ...ticket,
      user: userInfo,
      thread: thread.data,
      unread: unreadFromThread(ticket, lastSender, opts.viewer),
    },
    error: null,
  };
}

export async function getSupportMessageForAdmin(
  supabase: SupabaseClient,
  id: string
): Promise<{ data: AdminSupportTicketDetail | null; error: string | null }> {
  return getSupportTicketDetail(supabase, id, {
    viewer: "admin",
    includeEmail: true,
  });
}

export async function markSupportTicketRead(
  supabase: SupabaseClient,
  id: string
): Promise<{ data: AdminSupportTicket | null; error: string | null }> {
  const { data, error } = await supabase.rpc("mark_admin_support_ticket_read", {
    p_ticket_id: id,
  });

  if (error) {
    // Fallback if RPC not yet applied: best-effort local update for admin path only.
    return { data: null, error: error.message };
  }

  if (!data) return { data: null, error: null };
  return { data: asTicket(data as Record<string, unknown>), error: null };
}

export async function updateSupportMessageStatus(
  supabase: SupabaseClient,
  id: string,
  status: AdminSupportStatus
): Promise<{ data: AdminSupportTicket | null; error: string | null }> {
  const { data, error } = await supabase
    .from("admin_support_messages")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(TICKET_COLUMNS)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: asTicket(data as Record<string, unknown>), error: null };
}

export async function insertSupportReply(
  supabase: SupabaseClient,
  input: {
    ticketId: string;
    senderType: AdminSupportSenderType;
    senderUserId: string;
    message: string;
    language: "ru" | "en";
  }
): Promise<{
  data: AdminSupportThreadMessage | null;
  ticket: AdminSupportTicket | null;
  error: string | null;
}> {
  const { data: ticketBefore, error: ticketError } = await supabase
    .from("admin_support_messages")
    .select(TICKET_COLUMNS)
    .eq("id", input.ticketId)
    .maybeSingle();

  if (ticketError) {
    return { data: null, ticket: null, error: ticketError.message };
  }
  if (!ticketBefore) {
    return { data: null, ticket: null, error: "not_found" };
  }

  const ticket = asTicket(ticketBefore as Record<string, unknown>);
  if (ticket.status === "closed") {
    return { data: null, ticket, error: "closed" };
  }

  if (input.senderType === "user" && ticket.user_id !== input.senderUserId) {
    return { data: null, ticket: null, error: "forbidden" };
  }

  // Soft dedupe: same sender + same body within 15s → return existing row.
  const windowStart = new Date(Date.now() - 15_000).toISOString();
  const { data: recentReply } = await supabase
    .from("admin_support_thread_messages")
    .select(
      "id, ticket_id, sender_type, sender_user_id, message, language, created_at"
    )
    .eq("ticket_id", input.ticketId)
    .eq("sender_type", input.senderType)
    .eq("sender_user_id", input.senderUserId)
    .eq("message", input.message)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (recentReply) {
    return {
      data: asThreadMessage(recentReply as Record<string, unknown>),
      ticket,
      error: null,
    };
  }

  const { data: msg, error: insertError } = await supabase
    .from("admin_support_thread_messages")
    .insert({
      ticket_id: input.ticketId,
      sender_type: input.senderType,
      sender_user_id: input.senderUserId,
      message: input.message,
      language: input.language,
    })
    .select(
      "id, ticket_id, sender_type, sender_user_id, message, language, created_at"
    )
    .single();

  if (insertError || !msg) {
    return {
      data: null,
      ticket: null,
      error: insertError?.message ?? "insert_failed",
    };
  }

  const nextStatus: AdminSupportStatus =
    input.senderType === "admin" ? "answered" : "new";

  const now = new Date().toISOString();

  if (input.senderType === "user") {
    const { data: updatedTicket, error: statusError } = await supabase.rpc(
      "set_admin_support_ticket_after_user_message",
      { p_ticket_id: input.ticketId }
    );
    if (statusError) {
      return {
        data: asThreadMessage(msg as Record<string, unknown>),
        ticket: null,
        error: statusError.message,
      };
    }
    return {
      data: asThreadMessage(msg as Record<string, unknown>),
      ticket: updatedTicket
        ? asTicket(updatedTicket as Record<string, unknown>)
        : null,
      error: null,
    };
  }

  // Do not overwrite ticket.message (original user text). Thread history is source of truth.
  const patch: Record<string, unknown> = {
    status: nextStatus,
    updated_at: now,
    last_activity_at: now,
    admin_last_read_at: now,
  };

  const { data: updatedTicket, error: statusError } = await supabase
    .from("admin_support_messages")
    .update(patch)
    .eq("id", input.ticketId)
    .select(TICKET_COLUMNS)
    .single();

  if (statusError) {
    return {
      data: asThreadMessage(msg as Record<string, unknown>),
      ticket: null,
      error: statusError.message,
    };
  }

  return {
    data: asThreadMessage(msg as Record<string, unknown>),
    ticket: asTicket(updatedTicket as Record<string, unknown>),
    error: null,
  };
}
