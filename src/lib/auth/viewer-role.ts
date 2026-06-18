import type { OfferStatus, RequestStatus } from "@/types";

/** @deprecated use isRequestOwner */
export function resolveViewerIsCustomer(options: {
  customerId: string;
  userId?: string | null;
  viewerIsCustomer?: boolean;
  viewerIsOwner?: boolean;
  isDemo?: boolean;
  demoUserId?: string;
}): boolean {
  return isRequestOwner(options);
}

export function isRequestOwner(options: {
  customerId: string;
  userId?: string | null;
  viewerIsCustomer?: boolean;
  viewerIsOwner?: boolean;
  isDemo?: boolean;
  demoUserId?: string;
}): boolean {
  const {
    customerId,
    userId,
    viewerIsCustomer,
    viewerIsOwner,
    isDemo = false,
    demoUserId,
  } = options;

  if (isDemo && demoUserId) {
    return demoUserId === customerId;
  }

  if (userId) {
    return userId === customerId;
  }

  if (viewerIsOwner === true || viewerIsCustomer === true) {
    return true;
  }

  if (viewerIsOwner === false || viewerIsCustomer === false) {
    return false;
  }

  return false;
}

export function canDecideOnOffer(options: {
  customerId: string;
  userId?: string | null;
  viewerIsCustomer?: boolean;
  viewerIsOwner?: boolean;
  requestStatus: RequestStatus;
  offerStatus: OfferStatus;
  isDemo?: boolean;
  demoUserId?: string;
}): boolean {
  const isOwner = isRequestOwner({
    customerId: options.customerId,
    userId: options.userId,
    viewerIsCustomer: options.viewerIsCustomer,
    viewerIsOwner: options.viewerIsOwner,
    isDemo: options.isDemo,
    demoUserId: options.demoUserId,
  });

  return (
    isOwner &&
    options.requestStatus === "open" &&
    options.offerStatus === "pending"
  );
}
