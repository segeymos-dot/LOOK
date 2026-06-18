import { canActAsProvider } from "@/lib/auth/roles";
import { isDemoMode } from "@/lib/config";
import { getConversationWithProvider, getReviewsForProvider } from "@/lib/data/reviews-server";
import {
  getMockCategoriesForProvider,
  getMockProfile,
  getMockReviewsForProvider,
} from "@/lib/mock/data";
import { parsePortfolioItems } from "@/lib/profile/provider-utils";
import { createClient } from "@/lib/supabase/server";
import type { Category, Profile, Review } from "@/types";
import type { User } from "@supabase/supabase-js";

export function isMockProfileId(id: string): boolean {
  return /^user-\d+$/.test(id);
}

function normalizeProfile(profile: Profile): Profile {
  return {
    ...profile,
    portfolio_items: parsePortfolioItems(profile.portfolio_items),
    completed_orders_count: Number(profile.completed_orders_count ?? 0),
    phone_verified: Boolean(profile.phone_verified),
    provider_category_slugs: Array.isArray(profile.provider_category_slugs)
      ? profile.provider_category_slugs
      : [],
  };
}

function getMockProviderPageData(id: string): {
  profile: Profile;
  reviews: Review[];
  categories: Category[];
} | null {
  const profile = getMockProfile(id);
  if (!profile || !canActAsProvider(profile.role)) return null;

  return {
    profile: normalizeProfile(profile),
    reviews: getMockReviewsForProvider(id),
    categories: getMockCategoriesForProvider(profile.provider_category_slugs),
  };
}

async function getViewer(): Promise<User | null> {
  if (isDemoMode()) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

function buildMockPageResult(
  mock: NonNullable<ReturnType<typeof getMockProviderPageData>>,
  user: User | null,
  id: string
) {
  return {
    ...mock,
    chatHref: null as string | null,
    isAuthenticated: Boolean(user),
    isOwnProfile: user?.id === id,
    emailVerified: true,
  };
}

export async function resolveProviderPageData(id: string): Promise<{
  profile: Profile;
  reviews: Review[];
  categories: Category[];
  chatHref: string | null;
  isAuthenticated: boolean;
  isOwnProfile: boolean;
  emailVerified: boolean;
} | null> {
  if (isDemoMode() || isMockProfileId(id)) {
    const mock = getMockProviderPageData(id);
    if (!mock) return null;
    const user = await getViewer();
    return buildMockPageResult(mock, user, id);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", id).single();

  if (!profile || !canActAsProvider(profile.role)) {
    return null;
  }

  const normalizedProfile = normalizeProfile(profile as Profile);

  const [reviews, categoriesRes, conversationId] = await Promise.all([
    getReviewsForProvider(id),
    supabase.from("categories").select("*").order("sort_order"),
    user ? getConversationWithProvider(user.id, id) : Promise.resolve(null),
  ]);

  const categories =
    categoriesRes.data?.filter((c) =>
      normalizedProfile.provider_category_slugs?.includes(c.slug)
    ) ?? [];

  const isOwnProfile = user?.id === profile.id;

  return {
    profile: normalizedProfile,
    reviews,
    categories,
    chatHref: conversationId ? `/chat/${conversationId}` : null,
    isAuthenticated: Boolean(user),
    isOwnProfile,
    emailVerified: isOwnProfile ? Boolean(user?.email_confirmed_at) : true,
  };
}

export function getProviderMetadataProfile(id: string) {
  if (isDemoMode() || isMockProfileId(id)) {
    return getMockProfile(id) ?? null;
  }
  return null;
}
