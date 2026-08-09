import { canActAsProvider } from "@/lib/auth/roles";
import type { OfferStatus, RequestStatus } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type IncomingDirectedStatus = "new" | "offer_sent" | "in_progress" | "closed";

export type IncomingDirectedRequest = {
  conversation_id: string;
  request_id: string;
  title: string;
  status: RequestStatus;
  inbox_status: IncomingDirectedStatus;
  offer_status: OfferStatus | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string;
  location: string | null;
  created_at: string;
  category: {
    id: string;
    name: string;
    name_en?: string | null;
    slug: string;
  } | null;
  customer: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
};

type ConvRow = {
  id: string;
  created_at: string;
  offer_id: string | null;
  is_directed?: boolean | null;
  request_id: string;
  provider_id: string;
  request: {
    id: string;
    title: string;
    status: RequestStatus;
    budget_min: number | null;
    budget_max: number | null;
    currency: string;
    location: string | null;
    created_at: string;
    category: {
      id: string;
      name: string;
      name_en?: string | null;
      slug: string;
    } | null;
    customer: {
      id: string;
      full_name: string;
      avatar_url: string | null;
    } | null;
  } | null;
};

const REQUEST_EMBED = `
  id, title, status, budget_min, budget_max, currency, location, created_at,
  category:categories(id, name, name_en, slug),
  customer:profiles!requests_customer_id_fkey(id, full_name, avatar_url)
`;

function resolveInboxStatus(
  requestStatus: RequestStatus,
  offerStatus: OfferStatus | null
): IncomingDirectedStatus {
  if (requestStatus === "cancelled" || requestStatus === "completed") {
    return "closed";
  }
  if (offerStatus === "accepted" || requestStatus === "in_progress" || requestStatus === "pending_review") {
    return "in_progress";
  }
  if (offerStatus === "pending") {
    return "offer_sent";
  }
  // rejected / withdrawn / no offer → still actionable as incoming when open
  if (!offerStatus || offerStatus === "rejected" || offerStatus === "withdrawn") {
    return requestStatus === "open" ? "new" : "closed";
  }
  return "closed";
}

/** Badge counts only actionable directed invites not yet answered with a live offer. */
export function isPendingIncomingDirected(item: IncomingDirectedRequest): boolean {
  return item.inbox_status === "new";
}

function isDirectedRow(
  conv: ConvRow,
  offer: { created_at: string } | null | undefined
): boolean {
  if (conv.is_directed === true) return true;
  if (conv.is_directed === false) return false;
  // Fallback before migration 040: conversation without offer, or created before offer.
  if (!offer) return true;
  return new Date(conv.created_at).getTime() < new Date(offer.created_at).getTime();
}

async function loadProviderOffers(
  supabase: SupabaseClient,
  providerId: string,
  requestIds: string[]
): Promise<Map<string, { id: string; status: OfferStatus; created_at: string }>> {
  const map = new Map<string, { id: string; status: OfferStatus; created_at: string }>();
  if (requestIds.length === 0) return map;

  const { data } = await supabase
    .from("offers")
    .select("id, request_id, status, created_at")
    .eq("provider_id", providerId)
    .in("request_id", requestIds);

  for (const row of data ?? []) {
    map.set(row.request_id as string, {
      id: row.id as string,
      status: row.status as OfferStatus,
      created_at: row.created_at as string,
    });
  }
  return map;
}

async function fetchConversations(
  supabase: SupabaseClient,
  providerId: string
): Promise<{ rows: ConvRow[]; usedFlag: boolean }> {
  const withFlag = await supabase
    .from("conversations")
    .select(
      `id, created_at, offer_id, is_directed, request_id, provider_id, request:requests(${REQUEST_EMBED})`
    )
    .eq("provider_id", providerId)
    .eq("is_directed", true)
    .order("created_at", { ascending: false });

  if (!withFlag.error) {
    return { rows: (withFlag.data ?? []) as unknown as ConvRow[], usedFlag: true };
  }

  const msg = withFlag.error.message ?? "";
  const missingColumn =
    msg.includes("is_directed") ||
    msg.includes("does not exist") ||
    withFlag.error.code === "42703" ||
    withFlag.error.code === "PGRST204";

  if (!missingColumn) {
    console.error("fetchIncomingDirectedRequests:", withFlag.error.message);
    return { rows: [], usedFlag: false };
  }

  const legacy = await supabase
    .from("conversations")
    .select(
      `id, created_at, offer_id, request_id, provider_id, request:requests(${REQUEST_EMBED})`
    )
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false });

  if (legacy.error) {
    console.error("fetchIncomingDirectedRequests legacy:", legacy.error.message);
    return { rows: [], usedFlag: false };
  }

  return { rows: (legacy.data ?? []) as unknown as ConvRow[], usedFlag: false };
}

export async function fetchIncomingDirectedRequests(
  supabase: SupabaseClient,
  providerId: string
): Promise<IncomingDirectedRequest[]> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", providerId)
    .maybeSingle();

  if (!profile || !canActAsProvider(profile.role)) {
    return [];
  }

  const { rows, usedFlag } = await fetchConversations(supabase, providerId);
  if (rows.length === 0) return [];

  const requestIds = rows.map((r) => r.request_id).filter(Boolean);
  const offers = await loadProviderOffers(supabase, providerId, requestIds);

  const items: IncomingDirectedRequest[] = [];

  for (const conv of rows) {
    const request = conv.request;
    if (!request) continue;

    const offer = offers.get(conv.request_id) ?? null;
    if (!usedFlag && !isDirectedRow(conv, offer)) continue;

    const offerStatus = offer?.status ?? null;
    items.push({
      conversation_id: conv.id,
      request_id: request.id,
      title: request.title,
      status: request.status,
      inbox_status: resolveInboxStatus(request.status, offerStatus),
      offer_status: offerStatus,
      budget_min: request.budget_min,
      budget_max: request.budget_max,
      currency: request.currency,
      location: request.location,
      created_at: request.created_at,
      category: request.category,
      customer: request.customer
        ? {
            id: request.customer.id,
            full_name: request.customer.full_name,
            avatar_url: request.customer.avatar_url,
          }
        : null,
    });
  }

  return items;
}

export async function countPendingIncomingDirected(
  supabase: SupabaseClient,
  providerId: string
): Promise<number> {
  const items = await fetchIncomingDirectedRequests(supabase, providerId);
  return items.filter(isPendingIncomingDirected).length;
}
