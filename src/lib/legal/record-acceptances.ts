import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CURRENT_LICENSES_VERSION,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "@/lib/legal/versions";

export type LegalAcceptanceMethod = "signup" | "reconsent" | "admin_seed";

export type LegalConsentWrite = {
  terms_accepted_at: string;
  terms_version: string;
  privacy_accepted_at: string;
  privacy_version: string;
  licenses_acknowledged_at: string;
  licenses_version: string;
  adult_confirmed_at: string;
};

export function buildLegalConsentWrite(
  acceptedAt = new Date().toISOString()
): LegalConsentWrite {
  return {
    terms_accepted_at: acceptedAt,
    terms_version: CURRENT_TERMS_VERSION,
    privacy_accepted_at: acceptedAt,
    privacy_version: CURRENT_PRIVACY_VERSION,
    licenses_acknowledged_at: acceptedAt,
    licenses_version: CURRENT_LICENSES_VERSION,
    adult_confirmed_at: acceptedAt,
  };
}

/** Best-effort audit trail; profile columns remain source of truth for the gate. */
export async function recordLegalAcceptances(
  supabase: SupabaseClient,
  userId: string,
  method: LegalAcceptanceMethod,
  acceptedAt: string
): Promise<void> {
  const rows = [
    {
      user_id: userId,
      document_type: "terms",
      document_version: CURRENT_TERMS_VERSION,
      accepted_at: acceptedAt,
      acceptance_method: method,
    },
    {
      user_id: userId,
      document_type: "privacy",
      document_version: CURRENT_PRIVACY_VERSION,
      accepted_at: acceptedAt,
      acceptance_method: method,
    },
    {
      user_id: userId,
      document_type: "licenses",
      document_version: CURRENT_LICENSES_VERSION,
      accepted_at: acceptedAt,
      acceptance_method: method,
    },
    {
      user_id: userId,
      document_type: "adult",
      document_version: "18+",
      accepted_at: acceptedAt,
      acceptance_method: method,
    },
  ];

  const { error } = await supabase.from("legal_acceptances").insert(rows);
  if (error) {
    console.error("[legal_acceptances]", error.message);
  }
}
