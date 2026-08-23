/** Decode Supabase JWT claims without verifying (server already validated the session). */

export type AccessTokenClaims = {
  sub?: string;
  session_id?: string;
  email?: string;
  aal?: string;
  exp?: number;
};

export function decodeAccessTokenClaims(
  accessToken: string | null | undefined
): AccessTokenClaims | null {
  if (!accessToken) return null;
  const parts = accessToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob === "function"
        ? atob(payload)
        : Buffer.from(payload, "base64").toString("utf8");
    return JSON.parse(json) as AccessTokenClaims;
  } catch {
    return null;
  }
}

export function deviceLabelFromUserAgent(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua) return "Unknown device";

  let os = "Unknown OS";
  if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";

  return `${browser} · ${os}`;
}
