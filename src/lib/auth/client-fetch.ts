import { createClient } from "@/lib/supabase/client";

export async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}

export async function getAuthenticatedUser() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.user ?? null;
}

export async function authFetch(
  input: string,
  init: RequestInit = {},
  options?: { timeoutMs?: number }
): Promise<Response> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return new Response(
      JSON.stringify({ success: false, error: "Необходима авторизация" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  const timeoutMs = options?.timeoutMs;
  if (!timeoutMs || timeoutMs <= 0) {
    return fetch(input, { ...init, headers });
  }

  const controller = new AbortController();
  const external = init.signal;
  const onAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Превышено время ожидания ответа сервера",
        }),
        { status: 504, headers: { "Content-Type": "application/json" } }
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener("abort", onAbort);
  }
}
