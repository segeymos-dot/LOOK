/**
 * Resolve whitelist voice intents to admin navigation only.
 * Uses existing admin list APIs (requireAdminContext server-side).
 */

import { authFetch } from "@/lib/auth/client-fetch";
import type { VoiceNavIntent } from "@/lib/admin/voice-intents";

export type VoiceNavResolveResult =
  | { status: "navigate"; href: string }
  | { status: "not_found" }
  | { status: "unknown" }
  | { status: "error" };

async function searchUsers(
  kind: "customers" | "providers",
  q: string
): Promise<{ id: string }[]> {
  const params = new URLSearchParams({ q, page: "1" });
  const res = await authFetch(`/api/admin/${kind}?${params.toString()}`);
  const data = (await res.json()) as {
    success?: boolean;
    items?: { id: string }[];
    total?: number;
  };
  if (!res.ok || !data.success) return [];
  return data.items ?? [];
}

async function searchOrders(q: string): Promise<{ id: string }[]> {
  const params = new URLSearchParams({ q, tab: "all", page: "1" });
  const res = await authFetch(`/api/admin/orders?${params.toString()}`);
  const data = (await res.json()) as {
    success?: boolean;
    items?: { id: string }[];
    total?: number;
  };
  if (!res.ok || !data.success) return [];
  return data.items ?? [];
}

function listOrDetail(
  basePath: string,
  q: string,
  items: { id: string }[],
  totalHint?: number
): VoiceNavResolveResult {
  const total = totalHint ?? items.length;
  if (total === 0 || items.length === 0) return { status: "not_found" };
  if (total === 1 || items.length === 1) {
    return { status: "navigate", href: `${basePath}/${items[0].id}` };
  }
  return {
    status: "navigate",
    href: `${basePath}?q=${encodeURIComponent(q)}`,
  };
}

export async function resolveVoiceNavIntent(
  intent: VoiceNavIntent
): Promise<VoiceNavResolveResult> {
  switch (intent.type) {
    case "open_stats":
      return { status: "navigate", href: "/admin/stats" };
    case "open_platform":
      return { status: "navigate", href: "/admin/platform" };
    case "open_orders":
      return { status: "navigate", href: "/admin/orders" };
    case "open_orders_completed":
      return { status: "navigate", href: "/admin/orders?tab=completed" };
    case "open_orders_active":
      return { status: "navigate", href: "/admin/orders?tab=active" };
    case "open_customers":
      return { status: "navigate", href: "/admin/customers" };
    case "open_providers":
      return { status: "navigate", href: "/admin/providers" };
    case "open_disputes":
      return { status: "navigate", href: "/admin/disputes" };
    case "find_customer": {
      try {
        const items = await searchUsers("customers", intent.q);
        return listOrDetail("/admin/customers", intent.q, items);
      } catch {
        return { status: "error" };
      }
    }
    case "find_provider": {
      try {
        const items = await searchUsers("providers", intent.q);
        return listOrDetail("/admin/providers", intent.q, items);
      } catch {
        return { status: "error" };
      }
    }
    case "find_order": {
      try {
        const items = await searchOrders(intent.q);
        return listOrDetail("/admin/orders", intent.q, items);
      } catch {
        return { status: "error" };
      }
    }
    case "unknown":
    default:
      return { status: "unknown" };
  }
}
