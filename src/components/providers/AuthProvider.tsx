"use client";

import { buildProfileFromUser, normalizeProfile } from "@/lib/auth/profile-fallback";
import { canActAsCustomer, canActAsProvider } from "@/lib/auth/roles";
import { isDemoMode } from "@/lib/config";
import { mockCurrentUser } from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  profile: Profile | null;
  ready: boolean;
  /** False while profile is being fetched for the current user */
  profileReady: boolean;
}

export interface AuthContextValue extends AuthState {
  /** @deprecated use `ready` — kept for existing call sites */
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setProfile: (profile: Profile | null) => void;
  isProvider: boolean;
  isCustomer: boolean;
  isPlatformAdmin: boolean;
  displayProfile: Profile | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const demoUser: User = {
  id: mockCurrentUser.id,
  app_metadata: {},
  user_metadata: {
    full_name: mockCurrentUser.full_name,
    role: mockCurrentUser.role,
  },
  aud: "authenticated",
  created_at: mockCurrentUser.created_at,
} as User;

async function fetchProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) return null;
    return normalizeProfile(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    isDemoMode()
      ? { user: demoUser, profile: mockCurrentUser, ready: true, profileReady: true }
      : { user: null, profile: null, ready: false, profileReady: true }
  );

  useEffect(() => {
    if (isDemoMode()) {
      setState({ user: demoUser, profile: mockCurrentUser, ready: true, profileReady: true });
      return;
    }

    let active = true;
    let supabase: SupabaseClient;

    try {
      supabase = createClient();
    } catch {
      setState({ user: null, profile: null, ready: true, profileReady: true });
      return;
    }

    const applySession = (user: User | null) => {
      if (!active) return;

      if (!user) {
        setState({ user: null, profile: null, ready: true, profileReady: true });
        return;
      }

      setState((current) => ({
        user,
        profile: current.user?.id === user.id ? current.profile : null,
        ready: true,
        profileReady: current.user?.id === user.id ? current.profileReady : false,
      }));

      void fetchProfile(supabase, user.id).then((profile) => {
        if (!active) return;
        setState((current) =>
          current.user?.id === user.id
            ? { ...current, profile, profileReady: true }
            : current
        );
      });
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    if (isDemoMode()) {
      setState({ user: null, profile: null, ready: true, profileReady: true });
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    setState({ user: null, profile: null, ready: true, profileReady: true });
  }, []);

  const setProfile = useCallback((profile: Profile | null) => {
    setState((current) => ({ ...current, profile }));
  }, []);

  const refreshProfile = useCallback(async () => {
    if (isDemoMode()) {
      setState({ user: demoUser, profile: mockCurrentUser, ready: true, profileReady: true });
      return;
    }

    const supabase = createClient();
    let userId: string | null = null;

    setState((current) => {
      userId = current.user?.id ?? null;
      return current;
    });

    if (!userId) return;

    setState((current) =>
      current.user?.id === userId ? { ...current, profileReady: false } : current
    );

    const profile = await fetchProfile(supabase, userId);
    setState((current) =>
      current.user?.id === userId
        ? { ...current, profile, ready: true, profileReady: true }
        : current
    );
  }, []);

  const displayProfile = useMemo(
    () => (state.user ? buildProfileFromUser(state.user, state.profile) : null),
    [state.user, state.profile]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      loading: !state.ready,
      signOut,
      refreshProfile,
      setProfile,
      displayProfile,
      isProvider: canActAsProvider(displayProfile?.role),
      isCustomer: canActAsCustomer(displayProfile?.role),
      isPlatformAdmin: Boolean(displayProfile?.is_platform_admin),
    }),
    [state, signOut, refreshProfile, setProfile, displayProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
