/**
 * Legal operator / contact placeholders.
 * Fill before production — do not invent company details.
 */
export type LegalOperatorConfig = {
  legalName: string | null;
  registrationNumber: string | null;
  address: string | null;
  legalEmail: string | null;
  privacyEmail: string | null;
  supportEmail: string | null;
  paymentProvider: string | null;
  applicableLaw: string | null;
  disputeVenue: string | null;
  dataHostingRegions: string | null;
  kycProvider: string | null;
};

export const LEGAL_OPERATOR: LegalOperatorConfig = {
  legalName: null,
  registrationNumber: null,
  address: null,
  legalEmail: null,
  privacyEmail: null,
  supportEmail: null,
  /** Stripe Checkout is implemented when env keys are configured; not invented. */
  paymentProvider: "Stripe (when configured)",
  applicableLaw: null,
  disputeVenue: null,
  dataHostingRegions: null,
  kycProvider: null,
};
