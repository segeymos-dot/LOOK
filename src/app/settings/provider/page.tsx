"use client";

import { SettingsShell } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function SettingsProviderPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isProvider, ready } = useAuth();
  const [categories, setCategories] = useState("");
  const [locations, setLocations] = useState("");
  const [availability, setAvailability] = useState("available");
  const [bio, setBio] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [publicVisible, setPublicVisible] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!isProvider) router.replace("/settings");
  }, [ready, isProvider, router]);

  useEffect(() => {
    void authFetch("/api/settings/preferences")
      .then((r) => r.json())
      .then((data) => {
        const p = data.profile;
        if (!p) return;
        setCategories((p.provider_category_slugs ?? []).join(", "));
        setLocations((p.service_locations ?? []).join(", "));
        setAvailability(p.availability_status ?? "available");
        setBio(p.bio ?? "");
        setPayoutNote(p.payout_details_note ?? "");
        setPublicVisible(p.public_profile_visible !== false);
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
          provider_category_slugs: categories
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          service_locations: locations
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          availability_status: availability,
          bio: bio.trim() || null,
          payout_details_note: payoutNote.trim() || null,
          public_profile_visible: publicVisible,
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

  if (!isProvider) return null;

  return (
    <SettingsShell title={t("settings.provider.title")}>
      <Card padding="md" className="space-y-3">
        <Input
          label={t("settings.provider.categories")}
          value={categories}
          onChange={(e) => setCategories(e.target.value)}
          placeholder="repair, design"
        />
        <Input
          label={t("settings.provider.serviceLocations")}
          value={locations}
          onChange={(e) => setLocations(e.target.value)}
          hint={t("settings.provider.serviceLocationsHint")}
        />
        <Select
          id="availability"
          label={t("settings.provider.availability")}
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
        >
          <option value="available">
            {t("settings.provider.availabilityOptions.available")}
          </option>
          <option value="busy">
            {t("settings.provider.availabilityOptions.busy")}
          </option>
          <option value="away">
            {t("settings.provider.availabilityOptions.away")}
          </option>
          <option value="offline">
            {t("settings.provider.availabilityOptions.offline")}
          </option>
        </Select>
        <Textarea
          id="provider-bio"
          label={t("settings.provider.profileDescription")}
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
        <Textarea
          id="payout-note"
          label={t("settings.provider.payoutDetails")}
          rows={2}
          value={payoutNote}
          onChange={(e) => setPayoutNote(e.target.value)}
          hint={t("settings.provider.payoutPlaceholder")}
        />
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle px-3 py-3">
          <span className="text-sm text-text-primary">
            {t("settings.provider.publicVisibility")}
          </span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={publicVisible}
            onChange={(e) => setPublicVisible(e.target.checked)}
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
