import { authFetch, getAccessToken } from "@/lib/auth/client-fetch";
import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";

export { authFetch, getAccessToken };

export function createClientFromSession(accessToken: string) {
  return createAuthenticatedClient(accessToken);
}

export async function withAuthenticatedClient<T>(
  fn: (accessToken: string) => Promise<T>
): Promise<{ data: T } | { error: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { error: "Необходима авторизация" };
  }

  try {
    const data = await fn(accessToken);
    return { data };
  } catch {
    return { error: "Не удалось выполнить запрос" };
  }
}
