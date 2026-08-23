"use client";

import { SettingsShell } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import { useEffect, useState } from "react";

type Prefs = {
  orderUpdates: boolean;
  messages: boolean;
  marketing: boolean;
  disputeUpdates: boolean;
};

export default function SettingsNotificationsPage() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<Prefs>({
    orderUpdates: true,
    messages: true,
    marketing: false,
    disputeUpdates: true,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void authFetch("/api/settings/preferences")
      .then((r) => r.json())
      .then((data) => {
        const n = data.profile?.notification_preferences ?? {};
        setPrefs({
          orderUpdates: n.orderUpdates !== false,
          messages: n.messages !== false,
          marketing: Boolean(n.marketing),
          disputeUpdates: n.disputeUpdates !== false,
        });
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
        body: JSON.stringify({ notification_preferences: prefs }),
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

  const Toggle = ({
    label,
    keyName,
  }: {
    label: string;
    keyName: keyof Prefs;
  }) => (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle px-3 py-3">
      <span className="text-sm text-text-primary">{label}</span>
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={prefs[keyName]}
        onChange={(e) =>
          setPrefs((p) => ({ ...p, [keyName]: e.target.checked }))
        }
      />
    </label>
  );

  return (
    <SettingsShell title={t("settings.notifications.title")}>
      <Card padding="md" className="space-y-2">
        <Toggle
          label={t("settings.notifications.orderUpdates")}
          keyName="orderUpdates"
        />
        <Toggle label={t("settings.notifications.messages")} keyName="messages" />
        <Toggle
          label={t("settings.notifications.disputeUpdates")}
          keyName="disputeUpdates"
        />
        <Toggle
          label={t("settings.notifications.marketing")}
          keyName="marketing"
        />
        {message && <p className="text-sm text-emerald-700">{message}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button className="w-full" loading={loading} onClick={() => void save()}>
          {t("common.save")}
        </Button>
      </Card>
    </SettingsShell>
  );
}
