"use client";

import { useEffect } from "react";
import { getAccessToken } from "@/lib/auth/client-fetch";

const VISITOR_KEY = "look_visitor_id";
const SESSION_KEY = "look_session_id";
const TABS_KEY = "look_presence_tabs";
const HEARTBEAT_MS = 30_000;
const TAB_STALE_MS = 120_000;

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function getVisitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing && existing.trim().length >= 8) return existing.trim();
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

function registerTab(tabId: string): void {
  const now = Date.now();
  const tabs = readTabs();
  for (const [id, ts] of Object.entries(tabs)) {
    if (now - ts > TAB_STALE_MS) delete tabs[id];
  }
  tabs[tabId] = now;
  writeTabs(tabs);
}

function touchTab(tabId: string): void {
  const tabs = readTabs();
  if (tabs[tabId] != null) {
    tabs[tabId] = Date.now();
    writeTabs(tabs);
  }
}

function unregisterTab(tabId: string): number {
  const tabs = readTabs();
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

  // sendBeacon cannot set Authorization; rely on cookie session + 90s timeout.
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

async function sendHeartbeat(): Promise<void> {
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
}

/**
 * Tracks unique visitors, visit sessions, and online presence via heartbeat.
 * Safe for Browser Tab, Safari, and Electron (localStorage + sessionStorage).
 * Multi-tab: only the last closing tab ends presence; otherwise 90s timeout applies.
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
      // Only clear presence when no other LOOK tabs remain.
      if (remaining === 0) endPresenceBeacon();
    };

    window.addEventListener("pagehide", onPageHide);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener("pagehide", onPageHide);
      unregisterTab(tabId);
    };
  }, []);

  return null;
}
