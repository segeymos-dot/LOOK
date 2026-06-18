export function getProviderOfferUrl(providerId: string) {
  return `/requests/new?provider=${providerId}`;
}

export function getProviderMessageUrl(providerId: string, chatHref: string | null) {
  if (chatHref) return chatHref;
  return `/requests/new?provider=${providerId}&intent=contact`;
}

export function getProviderLoginRedirect(providerId: string) {
  return `/login?redirect=${encodeURIComponent(`/providers/${providerId}`)}`;
}

export function getProviderOfferLoginRedirect(providerId: string) {
  return `/login?redirect=${encodeURIComponent(getProviderOfferUrl(providerId))}`;
}
