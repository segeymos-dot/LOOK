import type { Profile } from "@/types";

/** Columns safe to load for a public provider card (no phone/email/finance/prefs secrets). */
export const PUBLIC_PROVIDER_PROFILE_SELECT = [
  "id",
  "full_name",
  "avatar_url",
  "bio",
  "role",
  "city",
  "country",
  "skills",
  "portfolio",
  "portfolio_items",
  "provider_category_slugs",
  "rating",
  "reviews_count",
  "completed_orders_count",
  "phone_verified",
  "public_profile_visible",
  "privacy_preferences",
  "created_at",
  "updated_at",
].join(", ");

/** Compact public fields for offer / chat embeds (never phone, finance, prefs). */
export const PUBLIC_PROVIDER_CARD_SELECT = [
  "id",
  "full_name",
  "avatar_url",
  "role",
  "rating",
  "reviews_count",
  "completed_orders_count",
  "public_profile_visible",
].join(", ");

/** Display-only party fields in chat (customer or provider). */
export const CHAT_PARTY_PROFILE_SELECT = ["id", "full_name", "avatar_url"].join(", ");

type PublicProfileSource = Pick<
  Profile,
  | "id"
  | "full_name"
  | "avatar_url"
  | "bio"
  | "role"
  | "city"
  | "country"
  | "skills"
  | "portfolio"
  | "portfolio_items"
  | "provider_category_slugs"
  | "rating"
  | "reviews_count"
  | "completed_orders_count"
  | "phone_verified"
  | "public_profile_visible"
  | "privacy_preferences"
  | "created_at"
  | "updated_at"
> &
  Partial<Profile>;

/**
 * Strip private fields before sending a provider profile to the client public page.
 * Never include phone, email, payout notes, notification prefs, or admin flags.
 */
export function toPublicProviderProfile(
  profile: PublicProfileSource,
  options: { isOwnProfile: boolean }
): Profile {
  const showCity =
    options.isOwnProfile || profile.privacy_preferences?.showCity !== false;

  return {
    id: profile.id,
    full_name: profile.full_name,
    avatar_url: profile.avatar_url ?? null,
    bio: profile.bio ?? null,
    role: profile.role,
    phone: null,
    city: showCity ? profile.city ?? null : null,
    country: showCity ? profile.country ?? null : null,
    skills: profile.skills ?? null,
    portfolio: profile.portfolio ?? null,
    portfolio_items: Array.isArray(profile.portfolio_items)
      ? profile.portfolio_items
      : [],
    provider_category_slugs: Array.isArray(profile.provider_category_slugs)
      ? profile.provider_category_slugs
      : [],
    rating: Number(profile.rating ?? 0),
    reviews_count: Number(profile.reviews_count ?? 0),
    completed_orders_count: Number(profile.completed_orders_count ?? 0),
    phone_verified: Boolean(profile.phone_verified),
    public_profile_visible:
      profile.public_profile_visible === undefined
        ? true
        : Boolean(profile.public_profile_visible),
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
}

export function isProviderPubliclyVisible(
  profile: { public_profile_visible?: boolean | null },
  isOwnProfile: boolean
): boolean {
  if (isOwnProfile) return true;
  if (profile.public_profile_visible === false) return false;
  return true;
}
