"use client";

import { buildProfileFromUser, normalizeProfile } from "@/lib/auth/profile-fallback";
import { canActAsCustomer, canActAsProvider } from "@/lib/auth/roles";
import {
  LOOK_AUTH_BROADCAST,
  broadcastAuthEvent,
  clearPrivateClientStorage,
  hardenPostSignOutNavigation,
  type AuthBroadcastMessage,
} from "@/lib/auth/sign-out-cleanup";
import {
  canSwitchUiMode,
  readStoredUiMode,
  resolveEffectiveUiMode,
  writeStoredUiMode,
  type UiMode,
} from "@/lib/auth/ui-mode";
import { isDemoMode } from "@/lib/config";
import { mockCurrentUser } from "@/lib/mock/data";
import { createClient, resetBrowserClient } from "@/lib/supabase/client";
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

export type SignOutOptions = {
  /** local = this device; global = all devices (Auth refresh tokens). */
  scope?: "local" | "global";
  /** Clear interface language from this device (default: keep). */
  clearLocale?: boolean;
};

export interface AuthContextValue extends AuthState {
  /** @deprecated use `ready` — kept for existing call sites */
  loading: boolean;
  signOut: (options?: SignOutOptions) => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Re-read session from storage after server-side sign-in */
  syncSession: () => Promise<void>;
  setProfile: (profile: Profile | null) => void;
  /** Wipe in-memory private auth state immediately (account switch). */
  clearPrivateAuthState: () => void;
  /** Real capability: can act as provider (role provider|both). Never from uiMode. */
  isProvider: boolean;
  /** Real capability: can act as customer (role customer|both). Never from uiMode. */
  isCustomer: boolean;
  isPlatformAdmin: boolean;
  displayProfile: Profile | null;
  /** Stored UI preference for role=both; null when not applicable / not loaded. */
  uiMode: UiMode | null;
  /** Effective shell mode for nav/home (local preference only). */
  effectiveUiMode: UiMode;
  /** True when role=both and mode switch should be shown. */
  canSwitchUiMode: boolean;
  /** Persist UI mode locally; does not change profiles.role. */
  setUiMode: (mode: UiMode) => void;
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
  const [storedUiMode, setStoredUiMode] = useState<UiMode | null>(null);

  useEffect(() => {
    setStoredUiMode(readStoredUiMode());
  }, []);

  const clearPrivateAuthState = useCallback(() => {
    setState({ user: null, profile: null, ready: true, profileReady: true });
    setStoredUiMode(null);
  }, []);

  const setUiMode = useCallback((mode: UiMode) => {
    writeStoredUiMode(mode);
    setStoredUiMode(mode);
  }, []);

  useEffect(() => {
    if (isDemoMode()) {
      setState({ user: demoUser, profile: mockCurrentUser, ready: true, profileReady: true });
      return;
    }

    let active = true;
    let initialLoadDone = false;
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

      // Never keep previous account profile while the new user loads.
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

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      initialLoadDone = true;
      applySession(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!initialLoadDone) return;
      if (event === "SIGNED_OUT") {
        clearPrivateClientStorage();
        resetBrowserClient();
        applySession(null);
        return;
      }
      if (event === "SIGNED_IN" && session?.user) {
        broadcastAuthEvent({
          type: "SIGNED_IN",
          userId: session.user.id,
          at: Date.now(),
        });
      }
      applySession(session?.user ?? null);
    });

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(LOOK_AUTH_BROADCAST);
      channel.onmessage = (ev: MessageEvent<AuthBroadcastMessage>) => {
        const msg = ev.data;
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "SIGNED_OUT") {
          clearPrivateClientStorage();
          resetBrowserClient();
          clearPrivateAuthState();
        }
        if (msg.type === "SIGNED_IN") {
          // Another tab signed in as a (possibly different) user — resync.
          void supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user?.id !== msg.userId) {
              clearPrivateAuthState();
            }
            applySession(session?.user ?? null);
          });
        }
      };
    } catch {
      // ignore
    }

    return () => {
      active = false;
      subscription.unsubscribe();
      channel?.close();
    };
  }, [clearPrivateAuthState]);

  const signOut = useCallback(
    async (options?: SignOutOptions) => {
      const scope = options?.scope ?? "local";

      if (isDemoMode()) {
        clearPrivateAuthState();
        clearPrivateClientStorage({ clearLocale: options?.clearLocale });
        return;
      }

      try {
        const { getAccessToken } = await import("@/lib/auth/client-fetch");
        const token = await getAccessToken();
        await fetch("/api/auth/sign-out", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: "same-origin",
          body: JSON.stringify({ scope }),
          keepalive: true,
        });
      } catch {
        // fall through to local sign-out
      }

      try {
        const supabase = createClient();
        await supabase.auth.signOut({ scope });
      } catch {
        try {
          await createClient().auth.signOut();
        } catch {
          // ignore
        }
      }

      clearPrivateClientStorage({ clearLocale: options?.clearLocale });
      resetBrowserClient();
      clearPrivateAuthState();
      broadcastAuthEvent({ type: "SIGNED_OUT", at: Date.now() });
      hardenPostSignOutNavigation();
    },
    [clearPrivateAuthState]
  );

  const setProfile = useCallback((profile: Profile | null) => {
    setState((current) => ({ ...current, profile }));
  }, []);

  const syncSession = useCallback(async () => {
    if (isDemoMode()) {
      setState({ user: demoUser, profile: mockCurrentUser, ready: true, profileReady: true });
      return;
    }

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;

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

    const profile = await fetchProfile(supabase, user.id);
    setState((current) =>
      current.user?.id === user.id
        ? { ...current, profile, profileReady: true }
        : current
    );
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

  const role = displayProfile?.role;
  const effectiveUiMode = useMemo(
    () => resolveEffectiveUiMode(role, storedUiMode),
    [role, storedUiMode]
  );
  // Only the DB profiles row counts — never the fallback display profile.
  const isPlatformAdmin = Boolean(state.profile?.is_platform_admin);
  const switchAllowed =
    canSwitchUiMode(role) && !isPlatformAdmin && state.profileReady;

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      loading: !state.ready,
      signOut,
      refreshProfile,
      syncSession,
      setProfile,
      clearPrivateAuthState,
      displayProfile,
      // Capabilities — always from real role, never uiMode.
      isProvider: canActAsProvider(role),
      isCustomer: canActAsCustomer(role),
      isPlatformAdmin,
      uiMode: storedUiMode,
      effectiveUiMode,
      canSwitchUiMode: switchAllowed,
      setUiMode,
    }),
    [
      state,
      signOut,
      refreshProfile,
      syncSession,
      setProfile,
      clearPrivateAuthState,
      displayProfile,
      role,
      isPlatformAdmin,
      storedUiMode,
      effectiveUiMode,
      switchAllowed,
      setUiMode,
    ]
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
