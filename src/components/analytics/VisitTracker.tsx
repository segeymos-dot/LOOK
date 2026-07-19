"use client";

import { useEffect } from "react";

export function VisitTracker() {
  useEffect(() => {
    void fetch("/api/analytics/visit", { method: "POST", credentials: "same-origin" }).catch(
      () => undefined
    );
  }, []);

  return null;
}
