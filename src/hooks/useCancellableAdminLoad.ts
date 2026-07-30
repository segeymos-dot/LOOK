"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_TIMEOUT_MS = 45_000;
const EMPTY_DEPS: unknown[] = [];

type LoadState = "loading" | "ready" | "error";

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * Admin fetch helper that avoids the Strict Mode remount race:
 * abort + `if (inFlight) return` left sections stuck on "loading" forever.
 * Uses a generation id so remounts always start a fresh request.
 */
export function useCancellableAdminLoad<T>(options: {
  load: (signal: AbortSignal) => Promise<T>;
  timeoutMs?: number;
  /** Re-run when these change (like endpoint/kind). */
  deps?: unknown[];
  /** Auto-start on mount. Default true. */
  auto?: boolean;
}) {
  const {
    load,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    deps = EMPTY_DEPS,
    auto = true,
  } = options;
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<T | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(async () => {
    const id = ++generation.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    setRefreshing(true);
    setState((prev) => (prev === "ready" ? prev : "loading"));

    try {
      const next = await loadRef.current(controller.signal);
      if (id !== generation.current) return;
      setData(next);
      setState("ready");
    } catch (error) {
      if (id !== generation.current) return;
      if (isAbortError(error)) {
        // Timeout (still current) → error if we never loaded; keep ready data on refresh timeout.
        setState((prev) => (prev === "ready" ? prev : "error"));
        return;
      }
      setState("error");
      setData(null);
    } finally {
      window.clearTimeout(timeoutId);
      if (id === generation.current) setRefreshing(false);
    }
  }, [timeoutMs]);

  useEffect(() => {
    if (!auto) return;
    void run();
    return () => {
      generation.current += 1;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- explicit deps drive reload
  }, [auto, run, ...deps]);

  return {
    state,
    data,
    refreshing,
    reload: run,
  };
}
