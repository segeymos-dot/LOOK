"use client";

import { AdminMetricCards } from "@/components/admin/AdminMetricCards";
import { AdminActivityTable } from "@/components/admin/AdminActivityTable";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import type { AdminCustomerStats, AdminProviderStats } from "@/lib/admin/role-stats";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

type Kind = "customers" | "providers";

export function AdminRoleAnalyticsSection({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [stats, setStats] = useState<AdminCustomerStats | AdminProviderStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const endpoint =
    kind === "customers" ? "/api/admin/customer-stats" : "/api/admin/provider-stats";
  const prefix = kind === "customers" ? "admin.customerAnalytics" : "admin.providerAnalytics";

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRefreshing(true);
    setState((prev) => (prev === "ready" ? prev : "loading"));
    try {
      const res = await authFetch(endpoint, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const data = await res.json();
      if (!mounted.current || controller.signal.aborted) return;
      if (!res.ok || !data.stats) {
        setState("error");
        setStats(null);
        return;
      }
      setStats(data.stats);
      setState("ready");
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState("error");
      setStats(null);
    } finally {
      inFlight.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, [endpoint]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [endpoint]);

  const s = stats;
  const items = [
    { key: "registered", label: t(`${prefix}.registered`), value: s?.registeredTotal ?? null },
    { key: "online", label: t(`${prefix}.online`), value: s?.online ?? null },
    { key: "activeToday", label: t(`${prefix}.activeToday`), value: s?.uniqueActiveToday ?? null },
    { key: "active7d", label: t(`${prefix}.active7d`), value: s?.uniqueActive7d ?? null },
    { key: "active30d", label: t(`${prefix}.active30d`), value: s?.uniqueActive30d ?? null },
    { key: "sessionsToday", label: t(`${prefix}.sessionsToday`), value: s?.sessionsToday ?? null },
    { key: "sessions7d", label: t(`${prefix}.sessions7d`), value: s?.sessions7d ?? null },
    { key: "sessions30d", label: t(`${prefix}.sessions30d`), value: s?.sessions30d ?? null },
    { key: "newToday", label: t(`${prefix}.newToday`), value: s?.newToday ?? null },
    { key: "new7d", label: t(`${prefix}.new7d`), value: s?.new7d ?? null },
    { key: "new30d", label: t(`${prefix}.new30d`), value: s?.new30d ?? null },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary">{t(`${prefix}.title`)}</h2>
          <p className="text-sm text-text-secondary">{t(`${prefix}.subtitle`)}</p>
        </div>
        <Button
          variant="secondary"
          className="w-full shrink-0 gap-2 sm:w-auto"
          loading={refreshing && state !== "loading"}
          onClick={() => void load()}
        >
          <RefreshCw className="h-4 w-4" />
          {t("admin.refresh")}
        </Button>
      </div>

      <AdminMetricCards items={items} state={state} onRetry={() => void load()} />
      <AdminActivityTable kind={kind} />
    </div>
  );
}
