import type { UserRole } from "@/types";
import type { UiMode } from "@/lib/auth/ui-mode";
import { isRequestOwner } from "@/lib/auth/viewer-role";

export function canActAsProvider(role?: UserRole | null): boolean {
  return role === "provider" || role === "both";
}

export function canActAsCustomer(role?: UserRole | null): boolean {
  return role === "customer" || role === "both";
}

export function getRoleLabel(role?: UserRole | null): string {
  switch (role) {
    case "customer":
      return "Заказчик";
    case "provider":
      return "Исполнитель";
    case "both":
      return "Обе роли";
    default:
      return "Пользователь";
  }
}

/**
 * Provider bid/application CTA — never for platform admins.
 * Requires provider UI mode when the account can switch modes (role=both).
 */
export function canSubmitApplication(options: {
  authenticated: boolean;
  isPlatformAdmin?: boolean;
  /** Effective shell mode; must be provider to bid. */
  activeMode?: UiMode | null;
  role?: UserRole | null;
  requestStatus: string;
  isRequestOwner: boolean;
  viewerUserId?: string | null;
  customerId: string;
  ownOfferStatus?: string | null;
}): boolean {
  if (!options.authenticated || options.isPlatformAdmin) {
    return false;
  }
  if (!canActAsProvider(options.role)) {
    return false;
  }
  if (options.activeMode != null && options.activeMode !== "provider") {
    return false;
  }
  return canRespondToRequest({
    requestStatus: options.requestStatus,
    isRequestOwner: options.isRequestOwner,
    canActAsProvider: true,
    isPlatformAdmin: false,
    viewerUserId: options.viewerUserId,
    customerId: options.customerId,
    ownOfferStatus: options.ownOfferStatus,
  });
}

export function canRespondToRequest(options: {
  requestStatus: string;
  isRequestOwner: boolean;
  canActAsProvider: boolean;
  isPlatformAdmin?: boolean;
  viewerUserId?: string | null;
  customerId: string;
  ownOfferStatus?: string | null;
}): boolean {
  const {
    requestStatus,
    isRequestOwner,
    canActAsProvider,
    isPlatformAdmin,
    viewerUserId,
    customerId,
    ownOfferStatus,
  } = options;

  if (isPlatformAdmin) {
    return false;
  }

  if (requestStatus !== "open" || !canActAsProvider || !viewerUserId || isRequestOwner) {
    return false;
  }

  if (viewerUserId === customerId) {
    return false;
  }

  if (!ownOfferStatus) {
    return true;
  }

  return ownOfferStatus === "rejected" || ownOfferStatus === "withdrawn";
}

export function resolveRequestViewerMode(options: {
  customerId: string;
  viewerUserId?: string | null;
  viewerIsOwner?: boolean;
  requestStatus: string;
  profileRole?: UserRole | null;
  isPlatformAdmin?: boolean;
  ownOfferStatus?: string | null;
  isDemo?: boolean;
  demoUserId?: string;
}) {
  const requestOwner = isRequestOwner({
    customerId: options.customerId,
    userId: options.viewerUserId,
    viewerIsOwner: options.viewerIsOwner,
    isDemo: options.isDemo,
    demoUserId: options.demoUserId,
  });

  const providerRole = canActAsProvider(options.profileRole);
  const customerRole = canActAsCustomer(options.profileRole);
  const isAdmin = Boolean(options.isPlatformAdmin);

  return {
    isRequestOwner: requestOwner,
    canManageRequest: requestOwner,
    canRespondAsProvider: canRespondToRequest({
      requestStatus: options.requestStatus,
      isRequestOwner: requestOwner,
      canActAsProvider: providerRole,
      isPlatformAdmin: isAdmin,
      viewerUserId: options.viewerUserId,
      customerId: options.customerId,
      ownOfferStatus: options.ownOfferStatus,
    }),
    hasProviderRole: providerRole && !isAdmin,
    hasCustomerRole: customerRole,
  };
}
