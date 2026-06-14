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
  init: RequestInit = {}
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

  return fetch(input, { ...init, headers });
}
