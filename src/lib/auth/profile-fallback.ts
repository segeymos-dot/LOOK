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
    availability_status:
      raw.availability_status === "busy" ||
      raw.availability_status === "away" ||
      raw.availability_status === "offline" ||
      raw.availability_status === "available"
        ? raw.availability_status
        : "available",
    service_locations: Array.isArray(raw.service_locations)
      ? (raw.service_locations as string[])
      : [],
    public_profile_visible:
      raw.public_profile_visible === undefined
        ? true
        : Boolean(raw.public_profile_visible),
    default_location: (raw.default_location as string | null) ?? null,
    payout_details_note: (raw.payout_details_note as string | null) ?? null,
    notification_preferences:
      (raw.notification_preferences as Profile["notification_preferences"]) ?? {},
    privacy_preferences:
      (raw.privacy_preferences as Profile["privacy_preferences"]) ?? {},
    terms_accepted_at: (raw.terms_accepted_at as string | null) ?? null,
    terms_version: (raw.terms_version as string | null) ?? null,
    privacy_accepted_at: (raw.privacy_accepted_at as string | null) ?? null,
    privacy_version: (raw.privacy_version as string | null) ?? null,
    licenses_acknowledged_at:
      (raw.licenses_acknowledged_at as string | null) ?? null,
    licenses_version: (raw.licenses_version as string | null) ?? null,
    adult_confirmed_at: (raw.adult_confirmed_at as string | null) ?? null,
    phone_verified_at: (raw.phone_verified_at as string | null) ?? null,
  };
}
