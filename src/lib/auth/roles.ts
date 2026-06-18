import type { UserRole } from "@/types";
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

export function canRespondToRequest(options: {
  requestStatus: string;
  isRequestOwner: boolean;
  canActAsProvider: boolean;
  viewerUserId?: string | null;
  customerId: string;
  ownOfferStatus?: string | null;
}): boolean {
  const {
    requestStatus,
    isRequestOwner,
    canActAsProvider,
    viewerUserId,
    customerId,
    ownOfferStatus,
  } = options;

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

  return {
    isRequestOwner: requestOwner,
    canManageRequest: requestOwner,
    canRespondAsProvider: canRespondToRequest({
      requestStatus: options.requestStatus,
      isRequestOwner: requestOwner,
      canActAsProvider: providerRole,
      viewerUserId: options.viewerUserId,
      customerId: options.customerId,
      ownOfferStatus: options.ownOfferStatus,
    }),
    hasProviderRole: providerRole,
    hasCustomerRole: customerRole,
  };
}
