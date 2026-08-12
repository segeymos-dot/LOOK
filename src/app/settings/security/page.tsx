"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTimeT } from "@/lib/i18n/client-messages";
import Link from "next/link";
import { useEffect, useState } from "react";

type SecurityEvent = {
  id: string;
  event_type: string;
  created_at: string;
};

export default function SettingsSecurityPage() {
  const { t, locale } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [events, setEvents] = useState<SecurityEvent[]>([]);

  useEffect(() => {
    void authFetch("/api/auth/security-events")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.events)) setEvents(data.events);
      })
      .catch(() => undefined);
  }, []);

  const changePassword = async () => {
    if (newPassword !== confirmPassword) {
      setError(t("settings.security.passwordMismatch"));
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await authFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("settings.saveError"));
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage(t("settings.security.passwordUpdated"));
    } catch {
      setError(t("settings.saveError"));
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  const sendReset = async () => {
    setResetLoading(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) {
        setError(t("settings.saveError"));
        return;
      }
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        user.email,
        { redirectTo: `${window.location.origin}/reset-password` }
      );
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setMessage(t("settings.security.resetSent"));
    } catch {
      setError(t("settings.saveError"));
    } finally {
      setResetLoading(false);
    }
  };

  const eventLabel = (type: string) => {
    const key = `settings.security.events.${type}`;
    const label = t(key);
    return label === key ? type : label;
  };

  return (
    <SettingsShell title={t("settings.security.title")}>
      <Card padding="md" className="space-y-3">
        <h2 className="font-semibold text-text-primary">
          {t("settings.security.changePassword")}
        </h2>
        <PasswordInput
          label={t("settings.security.currentPassword")}
          name="current-password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <PasswordInput
          label={t("settings.security.newPassword")}
          name="new-password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <PasswordInput
          label={t("settings.security.confirmNewPassword")}
          name="confirm-new-password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <Button className="w-full" onClick={() => setConfirmOpen(true)}>
          {t("settings.security.changePassword")}
        </Button>
      </Card>

      <Card padding="md" className="space-y-3">
        <h2 className="font-semibold text-text-primary">
          {t("settings.security.resetPassword")}
        </h2>
        <p className="text-sm text-text-muted">
          {t("settings.security.resetPasswordHint")}
        </p>
        <Button
          variant="outline"
          className="w-full"
          loading={resetLoading}
          onClick={() => void sendReset()}
        >
          {t("settings.security.resetPassword")}
        </Button>
        <Link href="/forgot-password" className="block text-sm text-brand-600">
          {t("auth.login.forgot")}
        </Link>
      </Card>

      <Card padding="md" className="space-y-2">
        <h2 className="font-semibold text-text-primary">
          {t("settings.security.twoFactor")}
        </h2>
        <p className="text-sm text-text-muted">{t("settings.security.twoFactorHint")}</p>
        <Button variant="outline" className="w-full" disabled>
          {t("settings.security.twoFactorPlaceholder")}
        </Button>
      </Card>

      <Card padding="md" className="space-y-2">
        <h2 className="font-semibold text-text-primary">
          {t("settings.security.recentActivity")}
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-text-muted">{t("settings.security.noActivity")}</p>
        ) : (
          <ul className="space-y-2">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="rounded-xl border border-border-subtle px-3 py-2 text-sm"
              >
                <p className="font-medium text-text-primary">
                  {eventLabel(ev.event_type)}
                </p>
                <p className="text-xs text-text-muted">
                  {formatRelativeTimeT(
                    ev.created_at,
                    t,
                    locale === "en" ? "en-US" : "ru-RU"
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      <ConfirmDialog
        open={confirmOpen}
        title={t("settings.security.changePassword")}
        body={t("settings.contact.passwordRequired")}
        danger
        loading={loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void changePassword()}
      />
    </SettingsShell>
  );
}
