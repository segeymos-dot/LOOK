import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { UserRole } from "@/types";

function parseRole(value: unknown): UserRole {
  if (value === "customer" || value === "provider" || value === "both") {
    return value;
  }
  return "both";
}

export async function syncProfileFromSignupMetadata(
  supabase: SupabaseClient,
  user: User
): Promise<void> {
  const meta = user.user_metadata ?? {};
  const role = parseRole(meta.role);

  await supabase
    .from("profiles")
    .update({
      first_name:
        (typeof meta.first_name === "string" && meta.first_name.trim()) || undefined,
      last_name:
        (typeof meta.last_name === "string" && meta.last_name.trim()) || undefined,
      full_name:
        (typeof meta.full_name === "string" && meta.full_name.trim()) || undefined,
      role,
      phone: (meta.phone as string) || null,
      country: (meta.country as string) || null,
      city: (meta.city as string) || null,
      avatar_url: (meta.avatar_url as string) || null,
      bio: (meta.bio as string) || null,
      skills: (meta.skills as string) || null,
      portfolio: (meta.portfolio as string) || null,
      provider_category_slugs: Array.isArray(meta.provider_category_slugs)
        ? meta.provider_category_slugs
        : [],
    })
    .eq("id", user.id);
}
