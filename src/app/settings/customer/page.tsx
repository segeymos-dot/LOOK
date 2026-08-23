"use client";

import { SettingsShell } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function SettingsCustomerPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isCustomer, ready } = useAuth();
  const [defaultLocation, setDefaultLocation] = useState("");
  const [phone, setPhone] = useState("");
  const [orderUpdates, setOrderUpdates] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!isCustomer) router.replace("/settings");
  }, [ready, isCustomer, router]);

  useEffect(() => {
    void authFetch("/api/settings/preferences")
      .then((r) => r.json())
      .then((data) => {
        const p = data.profile;
        if (!p) return;
        setDefaultLocation(p.default_location ?? p.city ?? "");
        setPhone(p.phone ?? "");
        setOrderUpdates(p.notification_preferences?.orderUpdates !== false);
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
          default_location: defaultLocation.trim() || null,
          phone: phone.trim() || null,
          notification_preferences: { orderUpdates },
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

  if (!isCustomer) return null;

  return (
    <SettingsShell title={t("settings.customer.title")}>
      <Card padding="md" className="space-y-3">
        <Input
          label={t("settings.customer.defaultLocation")}
          value={defaultLocation}
          onChange={(e) => setDefaultLocation(e.target.value)}
        />
        <Input
          label={t("settings.customer.savedContact")}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle px-3 py-3">
          <span className="text-sm text-text-primary">
            {t("settings.customer.orderNotifications")}
          </span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={orderUpdates}
            onChange={(e) => setOrderUpdates(e.target.checked)}
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
