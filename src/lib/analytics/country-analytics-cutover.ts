/**
 * Marketing country analytics cutover.
 * Sessions started before this UTC instant stay in DB for audit but are
 * excluded from the default /admin/visitors-by-country marketing view.
 *
 * Set at production cutover deploy (2026-09-01). Do not move casually.
 */
export const COUNTRY_ANALYTICS_CUTOVER_AT = "2026-09-01T09:22:00.000Z";

export function countryAnalyticsCutoverDate(): Date {
  return new Date(COUNTRY_ANALYTICS_CUTOVER_AT);
}
