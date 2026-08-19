import {
  CURRENT_LICENSES_VERSION,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "@/lib/legal/versions";

export type LegalConsentProfileFields = {
  is_platform_admin?: boolean | null;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  privacy_accepted_at?: string | null;
  privacy_version?: string | null;
  licenses_acknowledged_at?: string | null;
  licenses_version?: string | null;
  adult_confirmed_at?: string | null;
};

/**
 * Platform admins are exempt until product decides otherwise.
 * Regular users must accept current terms + privacy + licenses and confirm 18+.
 */
export function needsLegalConsent(
  profile: LegalConsentProfileFields | null | undefined
): boolean {
  if (!profile) return false;
  if (profile.is_platform_admin) return false;
  if (!profile.terms_accepted_at || !profile.privacy_accepted_at) return true;
  if (!profile.licenses_acknowledged_at || !profile.adult_confirmed_at) return true;
  if (profile.terms_version !== CURRENT_TERMS_VERSION) return true;
  if (profile.privacy_version !== CURRENT_PRIVACY_VERSION) return true;
  if (profile.licenses_version !== CURRENT_LICENSES_VERSION) return true;
  return false;
}

export function hasCurrentLegalConsent(
  profile: LegalConsentProfileFields | null | undefined
): boolean {
  return Boolean(profile) && !needsLegalConsent(profile);
}

/** Paths that do not require legal consent while authenticated. */
export function isLegalConsentExemptPath(pathname: string): boolean {
  if (
    pathname.startsWith("/legal/accept") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/licenses") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/check-email") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/presence/") ||
    pathname.startsWith("/api/analytics/") ||
    pathname.startsWith("/api/health/") ||
    pathname.startsWith("/api/webhooks/")
  ) {
    return true;
  }
  return false;
}
