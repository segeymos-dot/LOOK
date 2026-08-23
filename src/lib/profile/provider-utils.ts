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
  // Prefer phone_verified flag — do not require raw phone (kept off public payloads).
  const profileComplete = Boolean(
    profile.full_name?.trim() &&
      profile.bio?.trim() &&
      Boolean(profile.phone?.trim()) &&
      (profile.skills?.trim() || (profile.portfolio_items?.length ?? 0) > 0)
  );

  return {
    phoneVerified: Boolean(profile.phone_verified_at),
    emailVerified,
    profileComplete,
  };
}

export function formatRating(rating: number) {
  if (!rating || rating <= 0) return "—";
  return rating.toFixed(1);
}
