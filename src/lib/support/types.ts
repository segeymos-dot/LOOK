import type { Locale } from "@/lib/i18n";

export const ADMIN_SUPPORT_STATUSES = [
  "new",
  "read",
  "answered",
  "closed",
] as const;

export type AdminSupportStatus = (typeof ADMIN_SUPPORT_STATUSES)[number];

export type AdminSupportUserRole = "customer" | "provider";

export type AdminSupportSenderType = "user" | "admin";

export type AdminSupportTicket = {
  id: string;
  user_id: string;
  user_role: AdminSupportUserRole;
  subject: string;
  /** Latest message body (kept in sync by trigger / insert). */
  message: string;
  language: Locale;
  status: AdminSupportStatus;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  admin_last_read_at: string | null;
  user_last_read_at: string | null;
};

export type AdminSupportThreadMessage = {
  id: string;
  ticket_id: string;
  sender_type: AdminSupportSenderType;
  sender_user_id: string | null;
  message: string;
  language: Locale;
  created_at: string;
};

export type AdminSupportUserInfo = {
  id: string;
  full_name: string | null;
  email: string | null;
  registered_at: string | null;
};

export type AdminSupportTicketListItem = AdminSupportTicket & {
  user?: AdminSupportUserInfo | null;
  last_message: string;
  last_sender_type: AdminSupportSenderType | null;
  unread: boolean;
};

export type AdminSupportTicketDetail = AdminSupportTicket & {
  user?: AdminSupportUserInfo | null;
  thread: AdminSupportThreadMessage[];
  unread: boolean;
};

/** @deprecated Use AdminSupportTicket — kept for gradual call-site updates. */
export type AdminSupportMessage = AdminSupportTicket;

/** @deprecated Use AdminSupportTicketListItem */
export type AdminSupportMessageWithUser = AdminSupportTicketListItem;

export function isAdminSupportStatus(value: string): value is AdminSupportStatus {
  return (ADMIN_SUPPORT_STATUSES as readonly string[]).includes(value);
}
