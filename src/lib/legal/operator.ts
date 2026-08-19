/**
 * Legal operator / contact placeholders.
 * Fill before production — do not invent company details.
 */
export type LegalOperatorConfig = {
  legalName: string | null;
  registrationNumber: string | null;
  address: string | null;
  privacyEmail: string | null;
  supportEmail: string | null;
  paymentProvider: string | null;
};

export const LEGAL_OPERATOR: LegalOperatorConfig = {
  legalName: null,
  registrationNumber: null,
  address: null,
  privacyEmail: null,
  supportEmail: null,
  paymentProvider: "Stripe (when configured)",
};
