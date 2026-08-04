"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { useEffect, useState } from "react";

export default function SettingsContactPage() {
  const { t } = useTranslation();
  const { displayProfile, user, refreshProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    void authFetch("/api/settings/preferences")
      .then((r) => r.json())
      .then((data) => {
        if (data.email) setEmail(data.email);
        setEmailVerified(Boolean(data.emailVerified));
        if (data.profile?.phone) setPhone(data.profile.phone);
      });
  }, []);

  useEffect(() => {
    if (displayProfile?.phone) setPhone(displayProfile.phone);
  }, [displayProfile?.phone]);

  const save = async () => {
    if (!password.trim()) {
      setError(t("settings.contact.passwordRequired"));
      return;
    }
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await authFetch("/api/auth/change-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: password,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("settings.saveError"));
        return;
      }
      setPassword("");
      await refreshProfile();
      setMessage(
        data.emailPendingConfirmation
          ? t("settings.contact.emailChangeHint")
          : t("settings.saved")
      );
    } catch {
      setError(t("settings.saveError"));
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  return (
    <SettingsShell title={t("settings.contact.title")}>
      <Card padding="md" className="space-y-4">
        <div>
          <Input
            label={t("settings.contact.email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="mt-1 text-xs text-text-muted">
            {emailVerified || user?.email_confirmed_at
              ? t("settings.contact.emailVerified")
              : t("settings.contact.emailUnverified")}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {t("settings.contact.emailChangeHint")}
          </p>
        </div>
        <div>
          <Input
            label={t("settings.contact.phone")}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="mt-1 text-xs text-text-muted">
            {displayProfile?.phone_verified
              ? t("settings.contact.phoneVerified")
              : t("settings.contact.phoneUnverified")}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {t("settings.contact.phoneChangeHint")}
          </p>
        </div>
        <PasswordInput
          label={t("settings.contact.confirmPassword")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {message && <p className="text-sm text-emerald-700">{message}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          className="w-full"
          loading={loading}
          onClick={() => setConfirmOpen(true)}
        >
          {t("common.save")}
        </Button>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title={t("settings.contact.changeEmail")}
        body={t("settings.contact.emailChangeHint")}
        danger
        loading={loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void save()}
      />
    </SettingsShell>
  );
}
