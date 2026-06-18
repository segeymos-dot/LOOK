import type { Profile, UserRole } from "@/types";
import type { User } from "@supabase/supabase-js";
import { parsePortfolioItems } from "@/lib/profile/provider-utils";

function parseRole(value: unknown): UserRole {
  if (value === "customer" || value === "provider" || value === "both") {
    return value;
  }
  return "both";
}

export function buildProfileFromUser(user: User, profile: Profile | null): Profile | null {
  if (profile) return profile;

  const now = new Date().toISOString();

  return {
    id: user.id,
    full_name:
      (typeof user.user_metadata?.full_name === "string" &&
        user.user_metadata.full_name.trim()) ||
      user.email?.split("@")[0] ||
      "Пользователь",
    avatar_url: null,
    bio: null,
    role: parseRole(user.user_metadata?.role),
    city: null,
    country: null,
    phone: null,
    skills: null,
    portfolio: null,
    portfolio_items: [],
    provider_category_slugs: [],
    rating: 0,
    reviews_count: 0,
    completed_orders_count: 0,
    phone_verified: false,
    created_at: user.created_at ?? now,
    updated_at: now,
  };
}

export function normalizeProfile(raw: Record<string, unknown>): Profile {
  const base = raw as unknown as Profile;
  return {
    ...base,
    phone: (raw.phone as string | null) ?? null,
    skills: (raw.skills as string | null) ?? null,
    portfolio: (raw.portfolio as string | null) ?? null,
    portfolio_items: parsePortfolioItems(raw.portfolio_items),
    provider_category_slugs: Array.isArray(raw.provider_category_slugs)
      ? (raw.provider_category_slugs as string[])
      : [],
    completed_orders_count: Number(raw.completed_orders_count ?? 0),
    phone_verified: Boolean(raw.phone_verified),
    is_platform_admin: Boolean(raw.is_platform_admin),
  };
}
