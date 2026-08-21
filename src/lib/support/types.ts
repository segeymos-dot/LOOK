import type { Locale } from "@/lib/i18n";

export const ADMIN_SUPPORT_STATUSES = [
  "new",
  "read",
  "answered",
  "closed",
] as const;

export type AdminSupportStatus = (typeof ADMIN_SUPPORT_STATUSES)[number];

export type AdminSupportUserRole = "customer" | "provider";

export type AdminSupportMessage = {
  id: string;
  user_id: string;
  user_role: AdminSupportUserRole;
  subject: string;
  message: string;
  language: Locale;
  status: AdminSupportStatus;
  created_at: string;
  updated_at: string;
};

export type AdminSupportMessageWithUser = AdminSupportMessage & {
  user?: {
    id: string;
    full_name: string | null;
  } | null;
};

export function isAdminSupportStatus(value: string): value is AdminSupportStatus {
  return (ADMIN_SUPPORT_STATUSES as readonly string[]).includes(value);
}
