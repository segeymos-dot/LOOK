"use client";

import { SettingsShell } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import { useEffect, useState } from "react";

export default function SettingsPrivacyPage() {
  const { t } = useTranslation();
  const [publicProfile, setPublicProfile] = useState(true);
  const [showCity, setShowCity] = useState(true);
  const [showPhone, setShowPhone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void authFetch("/api/settings/preferences")
      .then((r) => r.json())
      .then((data) => {
        setPublicProfile(data.profile?.public_profile_visible !== false);
        const p = data.profile?.privacy_preferences ?? {};
        setShowCity(p.showCity !== false);
        setShowPhone(Boolean(p.showPhoneToClients));
      });
  }, []);

  const save = async () => {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await authFetch("/api/settings/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_profile_visible: publicProfile,
          privacy_preferences: {
            showCity,
            showPhoneToClients: showPhone,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("settings.saveError"));
        return;
      }
      setMessage(t("settings.saved"));
    } catch {
      setError(t("settings.saveError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsShell title={t("settings.privacy.title")}>
      <Card padding="md" className="space-y-3">
        <label className="flex items-start justify-between gap-3 rounded-xl border border-border-subtle px-3 py-3">
          <span>
            <span className="block text-sm font-medium text-text-primary">
              {t("settings.privacy.publicProfile")}
            </span>
            <span className="mt-0.5 block text-xs text-text-muted">
              {t("settings.privacy.publicProfileHint")}
            </span>
          </span>
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={publicProfile}
            onChange={(e) => setPublicProfile(e.target.checked)}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle px-3 py-3">
          <span className="text-sm text-text-primary">
            {t("settings.privacy.showCity")}
          </span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={showCity}
            onChange={(e) => setShowCity(e.target.checked)}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle px-3 py-3">
          <span className="text-sm text-text-primary">
            {t("settings.privacy.showPhoneToClients")}
          </span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={showPhone}
            onChange={(e) => setShowPhone(e.target.checked)}
          />
        </label>
        {message && <p className="text-sm text-emerald-700">{message}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button className="w-full" loading={loading} onClick={() => void save()}>
          {t("common.save")}
        </Button>
      </Card>
    </SettingsShell>
  );
}
