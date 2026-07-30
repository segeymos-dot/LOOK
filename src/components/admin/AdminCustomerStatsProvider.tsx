"use client";

import { authFetch } from "@/lib/auth/client-fetch";
import type { AdminCustomerStats } from "@/lib/admin/role-stats";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useCancellableAdminLoad } from "@/hooks/useCancellableAdminLoad";

type Ctx = {
  state: "loading" | "ready" | "error";
  stats: AdminCustomerStats | null;
  refreshing: boolean;
  reload: () => Promise<void>;
};

const AdminCustomerStatsContext = createContext<Ctx | null>(null);

async function fetchCustomerStats(signal: AbortSignal): Promise<AdminCustomerStats> {
  const res = await authFetch("/api/admin/customer-stats", { signal });
  const data = (await res.json()) as { stats?: AdminCustomerStats; error?: string };
  if (!res.ok || !data.stats) {
    throw new Error(data.error || "Failed to load customer statistics");
  }
  return data.stats;
}

export function AdminCustomerStatsProvider({ children }: { children: ReactNode }) {
  const { state, data, refreshing, reload } = useCancellableAdminLoad<AdminCustomerStats>({
    load: fetchCustomerStats,
  });

  const value = useMemo<Ctx>(
    () => ({
      state,
      stats: data,
      refreshing,
      reload,
    }),
    [state, data, refreshing, reload]
  );

  return (
    <AdminCustomerStatsContext.Provider value={value}>
      {children}
    </AdminCustomerStatsContext.Provider>
  );
}

export function useAdminCustomerStats(): Ctx {
  const ctx = useContext(AdminCustomerStatsContext);
  if (!ctx) {
    throw new Error("useAdminCustomerStats must be used within AdminCustomerStatsProvider");
  }
  return ctx;
}
