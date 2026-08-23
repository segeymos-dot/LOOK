"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { formatRelativeTimeT } from "@/lib/i18n/client-messages";
import type { AccountSessionRow } from "@/lib/auth/account-sessions";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type ConfirmKind = "this" | "all" | "revoke" | null;

export default function SettingsSessionsPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { signOut } = useAuth();
  const [sessions, setSessions] = useState<AccountSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/auth/sessions");
      const data = await res.json();
      if (data.sessions) setSessions(data.sessions);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = sessions.filter((s) => s.is_current);
  const others = sessions.filter((s) => !s.is_current);

  const runConfirm = async () => {
    setActionLoading(true);
    setError(null);
    try {
      if (confirm === "this") {
        await signOut({ scope: "local" });
        router.replace("/login");
        router.refresh();
        return;
      }
      if (confirm === "all") {
        await authFetch("/api/auth/sessions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true, includeCurrent: true }),
        });
        await signOut({ scope: "global" });
        router.replace("/login");
        router.refresh();
        return;
      }
      if (confirm === "revoke" && revokeId) {
        const res = await authFetch("/api/auth/sessions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authSessionId: revokeId }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(data.error ?? t("settings.saveError"));
          return;
        }
        await load();
      }
    } catch {
      setError(t("settings.saveError"));
    } finally {
      setActionLoading(false);
      setConfirm(null);
      setRevokeId(null);
    }
  };

  const confirmCopy =
    confirm === "all"
      ? {
          title: t("settings.sessions.signOutAllTitle"),
          body: t("settings.sessions.signOutAllBody"),
          label: t("settings.sessions.signOutAll"),
        }
      : confirm === "revoke"
        ? {
            title: t("settings.sessions.revokeConfirmTitle"),
            body: t("settings.sessions.revokeConfirmBody"),
            label: t("settings.sessions.revoke"),
          }
        : {
            title: t("settings.sessions.signOutThisTitle"),
            body: t("settings.sessions.signOutThisBody"),
            label: t("settings.sessions.signOutThis"),
          };

  return (
    <SettingsShell title={t("settings.sessions.title")}>
      {loading ? (
        <p className="text-sm text-text-muted">{t("common.loading")}</p>
      ) : (
        <div className="space-y-4">
          <Card padding="md" className="space-y-2">
            <h2 className="font-semibold text-text-primary">
              {t("settings.sessions.current")}
            </h2>
            {(current.length ? current : [null]).map((s, i) => (
              <div
                key={s?.id ?? `current-${i}`}
                className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2"
              >
                <p className="text-sm font-medium text-text-primary">
                  {s?.device_label || t("settings.sessions.unknownDevice")}
                </p>
                {s?.last_seen_at && (
                  <p className="text-xs text-text-muted">
                    {t("settings.sessions.lastSeen", {
                      when: formatRelativeTimeT(
                        s.last_seen_at,
                        t,
                        locale === "en" ? "en-US" : "ru-RU"
                      ),
                    })}
                  </p>
                )}
              </div>
            ))}
          </Card>

          <Card padding="md" className="space-y-2">
            <h2 className="font-semibold text-text-primary">
              {t("settings.sessions.other")}
            </h2>
            {others.length === 0 ? (
              <p className="text-sm text-text-muted">{t("settings.sessions.empty")}</p>
            ) : (
              others.map((s) => (
                <div
                  key={s.id}
                  className="flex items-start justify-between gap-2 rounded-xl border border-border-subtle px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {s.device_label || t("settings.sessions.unknownDevice")}
                    </p>
                    <p className="text-xs text-text-muted">
                      {t("settings.sessions.lastSeen", {
                        when: formatRelativeTimeT(
                          s.last_seen_at,
                          t,
                          locale === "en" ? "en-US" : "ru-RU"
                        ),
                      })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRevokeId(s.auth_session_id);
                      setConfirm("revoke");
                    }}
                  >
                    {t("settings.sessions.revoke")}
                  </Button>
                </div>
              ))
            )}
          </Card>

          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setConfirm("this")}
            >
              {t("settings.sessions.signOutThis")}
            </Button>
            <Button
              variant="danger"
              className="w-full"
              onClick={() => setConfirm("all")}
            >
              {t("settings.sessions.signOutAll")}
            </Button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}

      <ConfirmDialog
        open={confirm != null}
        title={confirmCopy.title}
        body={confirmCopy.body}
        confirmLabel={confirmCopy.label}
        danger
        loading={actionLoading}
        onCancel={() => {
          setConfirm(null);
          setRevokeId(null);
        }}
        onConfirm={() => void runConfirm()}
      />
    </SettingsShell>
  );
}
