import type { UserRole } from "@/types";

export const LOOK_UI_MODE_KEY = "look_ui_mode";

export type UiMode = "customer" | "provider";

export function isUiMode(value: unknown): value is UiMode {
  return value === "customer" || value === "provider";
}

/** Read stored UI mode from localStorage (client only). */
export function readStoredUiMode(): UiMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOOK_UI_MODE_KEY);
    return isUiMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredUiMode(mode: UiMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOOK_UI_MODE_KEY, mode);
  } catch {
    // ignore quota / private mode
  }
}

export function clearStoredUiMode(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LOOK_UI_MODE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Resolve which UI shell to show. Never used for API/permissions.
 * - both → stored preference, default customer
 * - provider-only → always provider (no customer switch)
 * - customer-only → always customer
 */
export function resolveEffectiveUiMode(
  role: UserRole | null | undefined,
  stored: UiMode | null
): UiMode {
  if (role === "provider") return "provider";
  if (role === "both") {
    return stored === "provider" ? "provider" : "customer";
  }
  return "customer";
}

/** Whether the account can show Заказчик / Исполнитель UI switch. */
export function canSwitchUiMode(role: UserRole | null | undefined): boolean {
  return role === "both";
}
