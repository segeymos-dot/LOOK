"use client";

import { useEffect } from "react";
import { getAccessToken } from "@/lib/auth/client-fetch";

const VISITOR_KEY = "look_visitor_id";
const SESSION_KEY = "look_session_id";
const TABS_KEY = "look_presence_tabs";
const HEARTBEAT_MS = 30_000;
/** Tabs that have not heartbeated within this window are treated as gone. */
const TAB_STALE_MS = 90_000;

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function getVisitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing && existing.trim().length >= 8 && existing.trim().length <= 128) {
      return existing.trim();
    }
    const id = createId();
    window.localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return createId();
  }
}

function getSessionId(): string | null {
  try {
    // localStorage so multiple tabs share one visit session (not per-tab).
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function setSessionId(id: string) {
  try {
    window.localStorage.setItem(SESSION_KEY, id);
  } catch {
    // ignore
  }
}

function setVisitorId(id: string) {
  try {
    window.localStorage.setItem(VISITOR_KEY, id);
  } catch {
    // ignore
  }
}

type TabMap = Record<string, number>;

function readTabs(): TabMap {
  try {
    const raw = window.localStorage.getItem(TABS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TabMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeTabs(tabs: TabMap) {
  try {
    window.localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
  } catch {
    // ignore
  }
}

function pruneStaleTabs(tabs: TabMap, now = Date.now()): TabMap {
  const next: TabMap = {};
  for (const [id, ts] of Object.entries(tabs)) {
    if (typeof ts === "number" && now - ts <= TAB_STALE_MS) {
      next[id] = ts;
    }
  }
  return next;
}

function registerTab(tabId: string): void {
  const now = Date.now();
  const tabs = pruneStaleTabs(readTabs(), now);
  tabs[tabId] = now;
  writeTabs(tabs);
}

function touchTab(tabId: string): void {
  const now = Date.now();
  const tabs = pruneStaleTabs(readTabs(), now);
  tabs[tabId] = now;
  writeTabs(tabs);
}

function unregisterTab(tabId: string): number {
  const tabs = pruneStaleTabs(readTabs());
  delete tabs[tabId];
  writeTabs(tabs);
  return Object.keys(tabs).length;
}

async function authHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // anonymous visitor
  }
  return headers;
}

export function endPresenceBeacon(): void {
  if (typeof window === "undefined") return;
  const visitorId = getVisitorId();
  const sessionId = getSessionId();
  const payload = JSON.stringify({ visitorId, sessionId });

  // Prefer sendBeacon (Safari / Electron pagehide). Server clears by visitor_id
  // even without Authorization, so online drops immediately when last tab closes.
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon("/api/presence/end", blob);
    return;
  }

  void (async () => {
    const headers = await authHeaders();
    await fetch("/api/presence/end", {
      method: "POST",
      headers,
      credentials: "same-origin",
      body: payload,
      keepalive: true,
    });
  })();
}

let heartbeatInFlight: Promise<void> | null = null;

async function sendHeartbeat(): Promise<void> {
  if (heartbeatInFlight) return heartbeatInFlight;

  heartbeatInFlight = (async () => {
    const visitorId = getVisitorId();
    const sessionId = getSessionId();
    const headers = await authHeaders();

    const res = await fetch("/api/presence/heartbeat", {
      method: "POST",
      headers,
      credentials: "same-origin",
      body: JSON.stringify({ visitorId, sessionId }),
      keepalive: true,
    });

    if (!res.ok) return;

    const data = (await res.json()) as {
      visitorId?: string;
      sessionId?: string;
    };

    if (data.visitorId && data.visitorId !== visitorId) {
      setVisitorId(data.visitorId);
    }
    if (data.sessionId) {
      setSessionId(data.sessionId);
    }
  })().finally(() => {
    heartbeatInFlight = null;
  });

  return heartbeatInFlight;
}

/**
 * Tracks unique visitors, visit sessions, and online presence via heartbeat.
 * Browser Tab / Safari / Electron: localStorage visitor+session, pagehide end.
 * Multi-tab: shared visitor/session keys; only the last live tab ends presence.
 */
export function PresenceTracker() {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tabId = createId();
    registerTab(tabId);

    const beat = () => {
      if (cancelled) return;
      touchTab(tabId);
      void sendHeartbeat().catch(() => {
        // network blips should not throw
      });
    };

    beat();
    timer = setInterval(beat, HEARTBEAT_MS);

    const onPageHide = () => {
      const remaining = unregisterTab(tabId);
      if (remaining === 0) endPresenceBeacon();
    };

    // Re-register quickly after temporary offline so reconnect does not open
    // a duplicate presence key (server upserts by presence_key).
    const onOnline = () => {
      if (!cancelled) beat();
    };

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("online", onOnline);
      // Do not end presence here: React Strict Mode remounts and SPA navigations
      // would falsely drop online while other tabs (or the remount) are alive.
      unregisterTab(tabId);
    };
  }, []);

  return null;
}
