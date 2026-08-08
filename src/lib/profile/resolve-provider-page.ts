import { canActAsProvider } from "@/lib/auth/roles";
import { isDemoMode } from "@/lib/config";
import { getConversationWithProvider, getReviewsForProvider } from "@/lib/data/reviews-server";
import {
  getMockCategoriesForProvider,
  getMockProfile,
  getMockReviewsForProvider,
} from "@/lib/mock/data";
import { parsePortfolioItems } from "@/lib/profile/provider-utils";
import {
  isProviderPubliclyVisible,
  PUBLIC_PROVIDER_PROFILE_SELECT,
  toPublicProviderProfile,
} from "@/lib/profile/public-provider-profile";
import { createClient } from "@/lib/supabase/server";
import type { Category, Profile, Review } from "@/types";
import type { User } from "@supabase/supabase-js";

export function isMockProfileId(id: string): boolean {
  return /^user-\d+$/.test(id);
}

function normalizePortfolio(profile: Profile): Profile {
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
    profile: normalizePortfolio(profile),
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
  const isOwnProfile = user?.id === id;
  return {
    profile: toPublicProviderProfile(normalizePortfolio(mock.profile), {
      isOwnProfile,
    }),
    reviews: mock.reviews,
    categories: mock.categories,
    chatHref: null as string | null,
    isAuthenticated: Boolean(user),
    isOwnProfile,
    // Do not claim email verification to visitors.
    emailVerified: isOwnProfile ? Boolean(user?.email_confirmed_at) : false,
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

  const { data: profileRow } = await supabase
    .from("profiles")
    .select(PUBLIC_PROVIDER_PROFILE_SELECT)
    .eq("id", id)
    .maybeSingle();

  const profile = profileRow as Profile | null;
  if (!profile || !canActAsProvider(profile.role)) {
    return null;
  }

  const isOwnProfile = user?.id === profile.id;
  if (!isProviderPubliclyVisible(profile, isOwnProfile)) {
    return null;
  }

  const publicProfile = toPublicProviderProfile(normalizePortfolio(profile), {
    isOwnProfile,
  });

  const [reviews, categoriesRes, conversationId] = await Promise.all([
    getReviewsForProvider(id),
    supabase.from("categories").select("id, name, name_en, slug, icon, sort_order, created_at").order("sort_order"),
    user && !isOwnProfile
      ? getConversationWithProvider(user.id, id)
      : Promise.resolve(null),
  ]);

  const categories =
    categoriesRes.data?.filter((c) =>
      publicProfile.provider_category_slugs?.includes(c.slug)
    ) ?? [];

  return {
    profile: publicProfile,
    reviews,
    categories,
    chatHref: conversationId ? `/chat/${conversationId}` : null,
    isAuthenticated: Boolean(user),
    isOwnProfile,
    emailVerified: isOwnProfile ? Boolean(user?.email_confirmed_at) : false,
  };
}

export function getProviderMetadataProfile(id: string) {
  if (isDemoMode() || isMockProfileId(id)) {
    return getMockProfile(id) ?? null;
  }
  return null;
}
