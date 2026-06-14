const DEFAULT_DEV_ORIGIN = "http://localhost:3000";

export function getAppOrigin(fallbackOrigin?: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  if (fallbackOrigin) {
    return fallbackOrigin;
  }
  return DEFAULT_DEV_ORIGIN;
}

export function getExpectedDevHost(): string | null {
  if (process.env.NODE_ENV !== "development") return null;
  try {
    return new URL(getAppOrigin()).host;
  } catch {
    return "localhost:3000";
  }
}

export function safeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}
