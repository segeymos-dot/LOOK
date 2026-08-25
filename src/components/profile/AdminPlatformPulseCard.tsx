"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import type { AdminUserStats } from "@/lib/admin/user-stats";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type PluralForm = "one" | "few" | "many";

function pluralForm(n: number, locale: Locale): PluralForm {
  if (locale === "en") return n === 1 ? "one" : "many";
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return "one";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "few";
  return "many";
}

export function AdminPlatformPulseCard() {
  const { t, locale } = useTranslation();
  const [stats, setStats] = useState<AdminUserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await authFetch("/api/admin/stats", {
          cache: "no-store",
        });
        const data = (await res.json()) as { stats?: AdminUserStats; error?: string };
        if (!res.ok || !data.stats) {
          console.error("[AdminPlatformPulseCard]", data.error || res.status);
          if (!cancelled) {
            setError(true);
            setStats(null);
          }
          return;
        }
        if (!cancelled) setStats(data.stats);
      } catch {
        if (!cancelled) {
          setError(true);
          setStats(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fmt = (n: number | null | undefined) =>
    typeof n === "number" ? n.toLocaleString() : "—";

  const countWithWord = (
    n: number | null | undefined,
    kind: "visits" | "unique"
  ) => {
    if (typeof n !== "number") return "—";
    const form = pluralForm(n, locale);
    const key =
      kind === "visits"
        ? form === "one"
          ? "profile.platformPulse.visitsOne"
          : form === "few"
            ? "profile.platformPulse.visitsFew"
            : "profile.platformPulse.visitsMany"
        : form === "one"
          ? "profile.platformPulse.uniqueOne"
          : form === "few"
            ? "profile.platformPulse.uniqueFew"
            : "profile.platformPulse.uniqueMany";
    return `${fmt(n)} ${t(key)}`;
  };

  const todayReady = !loading && !error;

  return (
    <Link
      href="/admin/stats"
      aria-label={t("profile.platformPulse.ariaLabel")}
      className={cn(
        "block rounded-2xl outline-none",
        "focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      )}
    >
      <Card
        padding="md"
        className="min-h-[48px] transition-colors hover:bg-surface-muted active:bg-surface-muted"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-xs font-medium text-text-secondary">
                {t("profile.platformPulse.totalVisits")}
              </p>
              {loading ? (
                <p className="mt-1 text-sm text-text-muted">{t("common.loading")}</p>
              ) : error ? (
                <p className="mt-1 text-sm text-danger">{t("profile.platformPulse.loadError")}</p>
              ) : (
                <>
                  <p className="mt-0.5 text-3xl font-bold tabular-nums tracking-tight text-text-primary">
                    {fmt(stats?.totalVisits)}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {t("profile.platformPulse.allTime")}
                  </p>
                </>
              )}
            </div>

            <div>
              <p className="text-xs font-medium text-text-secondary">
                {t("profile.platformPulse.uniqueVisitors")}
              </p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-text-primary">
                {loading || error ? "—" : fmt(stats?.uniqueVisitors)}
              </p>
            </div>

            <p className="text-xs text-text-muted">
              {t("profile.platformPulse.todayLine", {
                visits: todayReady ? countWithWord(stats?.visitsToday, "visits") : "—",
                unique: todayReady ? countWithWord(stats?.uniqueVisitorsToday, "unique") : "—",
              })}
            </p>

            <div className="border-t border-border-subtle pt-2">
              <p className="text-xs font-medium text-text-secondary">
                {t("profile.platformPulse.adminSessions")}
              </p>
              <p className="mt-0.5 text-sm text-text-primary">
                {t("profile.platformPulse.adminLine", {
                  total: loading || error ? "—" : fmt(stats?.adminVisitsTotal),
                  today: loading || error ? "—" : fmt(stats?.adminVisitsToday),
                })}
              </p>
            </div>
          </div>
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-text-muted" aria-hidden />
        </div>
      </Card>
    </Link>
  );
}
