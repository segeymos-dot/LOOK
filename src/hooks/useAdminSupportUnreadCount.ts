"use client";

import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { isDemoMode } from "@/lib/config";
import { useCallback, useEffect, useState } from "react";

/**
 * Polls admin support unread message count (user→admin only).
 * Lightweight: 15s interval + refresh on focus/visibility.
 */
export function useAdminSupportUnreadCount(enabled = true) {
  const { isPlatformAdmin, ready, profileReady } = useAuth();
  const demo = isDemoMode();
  const active = enabled && ready && profileReady && (isPlatformAdmin || demo);
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!active) {
      setCount(0);
      return;
    }
    try {
      const res = await authFetch("/api/admin/support/unread-count", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setCount(Number(data.unread_messages) || 0);
      }
    } catch {
      // keep last known count
    }
  }, [active]);

  useEffect(() => {
    if (!active) {
      setCount(0);
      return;
    }
    void refresh();
    const poll = window.setInterval(() => void refresh(), 15_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onFocus = () => void refresh();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [active, refresh]);

  return { count, refresh };
}

export function formatUnreadBadge(count: number): string | null {
  if (count <= 0) return null;
  if (count > 99) return "99+";
  return String(count);
}
