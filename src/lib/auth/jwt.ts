export function getUserIdFromAccessToken(accessToken: string): string | null {
  try {
    const payloadPart = accessToken.split(".")[1];
    if (!payloadPart) return null;

    const payload = JSON.parse(
      Buffer.from(payloadPart, "base64url").toString("utf8")
    ) as { sub?: string };

    return payload.sub ?? null;
  } catch {
    return null;
  }
}
