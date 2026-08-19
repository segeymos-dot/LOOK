import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "@/lib/legal/versions";

const STORAGE_KEY = "look_register_legal_consent";

export type RegisterPreConsent = {
  accepted: true;
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: string;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

export function readRegisterPreConsent(): RegisterPreConsent | null {
  if (!canUseStorage()) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RegisterPreConsent>;
    if (
      parsed.accepted === true &&
      parsed.termsVersion === CURRENT_TERMS_VERSION &&
      parsed.privacyVersion === CURRENT_PRIVACY_VERSION &&
      typeof parsed.acceptedAt === "string"
    ) {
      return {
        accepted: true,
        termsVersion: parsed.termsVersion,
        privacyVersion: parsed.privacyVersion,
        acceptedAt: parsed.acceptedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Temporary flow consent only — not a backend/profile write. */
export function writeRegisterPreConsent(): RegisterPreConsent {
  const value: RegisterPreConsent = {
    accepted: true,
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
    acceptedAt: new Date().toISOString(),
  };
  if (canUseStorage()) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }
  return value;
}

export function clearRegisterPreConsent(): void {
  if (!canUseStorage()) return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
