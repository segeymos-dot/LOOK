import type { PortfolioItem, Profile, ProviderVerification } from "@/types";

export function parsePortfolioItems(raw: unknown): PortfolioItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is PortfolioItem => {
      return (
        typeof item === "object" &&
        item !== null &&
        typeof (item as PortfolioItem).id === "string" &&
        typeof (item as PortfolioItem).title === "string"
      );
    })
    .map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description ?? "",
      image_url: item.image_url ?? null,
      link: item.link ?? null,
    }));
}

export function getProviderVerification(
  profile: Profile,
  emailVerified = false
): ProviderVerification {
  const profileComplete = Boolean(
    profile.full_name?.trim() &&
      profile.bio?.trim() &&
      profile.phone?.trim() &&
      (profile.skills?.trim() || profile.portfolio_items.length > 0)
  );

  return {
    phoneVerified: profile.phone_verified || Boolean(profile.phone?.trim()),
    emailVerified,
    profileComplete,
  };
}

export function formatRating(rating: number) {
  if (!rating || rating <= 0) return "—";
  return rating.toFixed(1);
}
