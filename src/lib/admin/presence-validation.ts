/** Shared validation for presence / visitor tracking payloads. */

const VISITOR_ID_RE = /^[A-Za-z0-9_-]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeVisitorId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const visitorId = raw.trim();
  if (visitorId.length < 8 || visitorId.length > 128) return null;
  if (!VISITOR_ID_RE.test(visitorId)) return null;
  return visitorId;
}

export function normalizeSessionId(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") return null;
  const sessionId = raw.trim();
  if (!UUID_RE.test(sessionId)) return null;
  return sessionId;
}
