"use client";

import { SettingsShell } from "@/components/settings/SettingsShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import type { UserRole } from "@/types";
import { useEffect, useState } from "react";

export default function SettingsPersonalPage() {
  const { t } = useTranslation();
  const { displayProfile, refreshProfile, setProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [role, setRole] = useState<UserRole>("customer");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!displayProfile) return;
    setFullName(displayProfile.full_name ?? "");
    setCity(displayProfile.city ?? "");
    setBio(displayProfile.bio ?? "");
    setRole(displayProfile.role);
  }, [displayProfile]);

  const save = async () => {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await authFetch("/api/settings/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          city: city.trim() || null,
          bio: bio.trim() || null,
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("settings.saveError"));
        return;
      }
      if (data.profile) setProfile(data.profile);
      await refreshProfile();
      setMessage(t("settings.saved"));
    } catch {
      setError(t("settings.saveError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsShell title={t("settings.personal.title")}>
      <Card padding="md" className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar
            src={displayProfile?.avatar_url}
            name={fullName || "?"}
            size="lg"
          />
          <div>
            <p className="text-sm font-medium text-text-primary">
              {t("settings.personal.avatar")}
            </p>
            <p className="text-xs text-text-muted">{t("profile.avatar.hint")}</p>
            <p className="mt-1 text-xs text-text-muted">
              {t("profile.edit")} → {t("profile.avatar.change")}
            </p>
          </div>
        </div>
        <Input
          label={t("settings.personal.fullName")}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Input
          label={t("settings.personal.city")}
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <Textarea
          id="settings-bio"
          label={t("settings.personal.bio")}
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
        <Select
          id="settings-role"
          label={t("settings.personal.role")}
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
        >
          <option value="customer">{t("role.customer")}</option>
          <option value="provider">{t("role.provider")}</option>
          <option value="both">{t("role.both")}</option>
        </Select>
        {message && <p className="text-sm text-emerald-700">{message}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button loading={loading} onClick={() => void save()} className="w-full">
          {t("common.save")}
        </Button>
      </Card>
    </SettingsShell>
  );
}
