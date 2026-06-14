"use client";

import { isDemoMode } from "@/lib/config";
import { mockCurrentUser } from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";
import { useEffect, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
}

const demoUser: User = {
  id: mockCurrentUser.id,
  app_metadata: {},
  user_metadata: { full_name: mockCurrentUser.full_name },
  aud: "authenticated",
  created_at: mockCurrentUser.created_at,
} as User;

const AUTH_LOADING_TIMEOUT_MS = 5000;

async function fetchProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
  });

  useEffect(() => {
    if (isDemoMode()) {
      setState({ user: demoUser, profile: mockCurrentUser, loading: false });
      return;
    }

    const supabase = createClient();
    let active = true;

    const setAuthLoading = (loading: boolean) => {
      if (!active) return;
      setState((current) => ({ ...current, loading }));
    };

    const applySession = (user: User | null) => {
      if (!active) return;

      setState((current) => ({
        user,
        profile:
          user && current.user?.id === user.id ? current.profile : null,
        loading: false,
      }));

      if (!user) return;

      void fetchProfile(supabase, user.id).then((profile) => {
        if (!active) return;
        setState((current) =>
          current.user?.id === user.id ? { ...current, profile } : current
        );
      });
    };

    const timeout = window.setTimeout(() => {
      setAuthLoading(false);
    }, AUTH_LOADING_TIMEOUT_MS);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user ?? null);
    });

    // Defer so onAuthStateChange registers first (avoids Supabase auth lock deadlock).
    const initialCheck = window.setTimeout(() => {
      void supabase.auth
        .getSession()
        .then(({ data: { session }, error }) => {
          if (error) {
            applySession(null);
            return;
          }
          applySession(session?.user ?? null);
        })
        .catch(() => {
          applySession(null);
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      window.clearTimeout(initialCheck);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    if (isDemoMode()) {
      setState({ user: null, profile: null, loading: false });
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
  };

  return { ...state, signOut };
}
