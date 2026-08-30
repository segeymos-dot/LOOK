"use client";

import { SettingsShell } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { getCurrentPosition } from "@/lib/location/browser-geolocation";
import {
  formatLocationLabel,
  type LocationSource,
  type ProfileLocation,
} from "@/lib/location/types";
import { useCallback, useEffect, useState } from "react";

function sourceLabel(
  source: LocationSource | null | undefined,
  t: (key: string) => string
) {
  if (source === "gps") return t("location.sourceGps");
  if (source === "manual") return t("location.sourceManual");
  if (source === "unknown") return t("location.sourceUnknown");
  return t("location.sourceNone");
}

export default function SettingsLocationPage() {
  const { t, locale } = useTranslation();
  const { refreshProfile, setProfile, displayProfile } = useAuth();
  const [location, setLocation] = useState<ProfileLocation | null>(null);
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyLocation = useCallback((loc: ProfileLocation | null) => {
    setLocation(loc);
    setCountry(loc?.country ?? "");
    setRegion(loc?.region ?? "");
    setCity(loc?.city ?? displayProfile?.city ?? "");
  }, [displayProfile?.city]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/location", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("settings.saveError"));
        return;
      }
      applyLocation(data.location ?? null);
    } catch {
      setError(t("settings.saveError"));
    } finally {
      setLoading(false);
    }
  }, [applyLocation, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshGps = async () => {
    setRefreshing(true);
    setMessage(null);
    setError(null);
    try {
      const pos = await getCurrentPosition();
      if (!pos.ok) {
        if (pos.code === "PERMISSION_DENIED") {
          setError(t("location.deniedBrowserHint"));
          await authFetch("/api/location", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "permission",
              permission_state: "denied",
            }),
          });
        } else {
          setError(t("location.unavailable"));
        }
        return;
      }

      const geoRes = await authFetch("/api/location/reverse-geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: pos.latitude,
          lng: pos.longitude,
          locale: locale === "en" ? "en" : "ru",
        }),
      });
      const geoJson = await geoRes.json().catch(() => ({}));
      const place = geoJson.result ?? {};

      const saveRes = await authFetch("/api/location", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "gps",
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracy_m: pos.accuracy,
          country_code: place.country_code ?? null,
          country: place.country ?? null,
          region: place.region ?? null,
          city: place.city ?? null,
          permission_state: "granted",
        }),
      });
      const saveJson = await saveRes.json();
      if (!saveRes.ok || !saveJson.success) {
        setError(saveJson.error ?? t("location.saveError"));
        return;
      }
      applyLocation(saveJson.location);
      await refreshProfile();
      const label =
        formatLocationLabel({
          city: place.city ?? null,
          region: place.region ?? null,
          country: place.country ?? null,
        }) || t("location.detectedGeneric");
      setMessage(t("location.detected", { place: label }));
    } catch {
      setError(t("location.saveError"));
    } finally {
      setRefreshing(false);
    }
  };

  const saveManual = async () => {
    setRefreshing(true);
    setMessage(null);
    setError(null);
    try {
      const res = await authFetch("/api/location", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "manual",
          country: country.trim() || null,
          region: region.trim() || null,
          city: city.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? t("settings.saveError"));
        return;
      }
      applyLocation(data.location);
      // Keep display profile city/country in sync for header etc.
      if (displayProfile) {
        setProfile({
          ...displayProfile,
          city: data.location?.city ?? null,
          country: data.location?.country ?? null,
        });
      }
      await refreshProfile();
      setManualOpen(false);
      setMessage(t("settings.saved"));
    } catch {
      setError(t("settings.saveError"));
    } finally {
      setRefreshing(false);
    }
  };

  const label =
    formatLocationLabel({
      city: location?.city ?? displayProfile?.city ?? null,
      region: location?.region ?? null,
      country: location?.country ?? displayProfile?.country ?? null,
    }) || t("location.notSet");

  return (
    <SettingsShell title={t("location.settingsTitle")}>
      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-text-muted">{t("common.loading")}</p>
        ) : (
          <Card padding="md" className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                {t("location.current")}
              </p>
              <p className="mt-1 text-base font-semibold text-text-primary">
                {label}
              </p>
            </div>
            <p className="text-sm text-text-secondary">
              {t("location.source")}: {sourceLabel(location?.location_source, t)}
            </p>
            {location?.location_updated_at && (
              <p className="text-xs text-text-muted">
                {t("location.updatedAt")}:{" "}
                {new Date(location.location_updated_at).toLocaleString(
                  locale === "en" ? "en-GB" : "ru-RU"
                )}
              </p>
            )}
            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              <Button
                className="w-full sm:flex-1"
                loading={refreshing}
                onClick={() => void refreshGps()}
              >
                {t("location.updateGps")}
              </Button>
              <Button
                variant="outline"
                className="w-full sm:flex-1"
                onClick={() => setManualOpen((v) => !v)}
              >
                {t("location.setManual")}
              </Button>
            </div>
          </Card>
        )}

        {manualOpen && (
          <Card padding="md" className="space-y-3">
            <p className="text-sm font-medium text-text-primary">
              {t("location.manualTitle")}
            </p>
            <Input
              label={t("location.country")}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
            <Input
              label={t("location.region")}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
            <Input
              label={t("location.city")}
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
            <p className="text-xs text-text-muted">{t("location.manualHint")}</p>
            <Button loading={refreshing} onClick={() => void saveManual()}>
              {t("common.save")}
            </Button>
          </Card>
        )}

        {location?.location_permission_state === "denied" && (
          <Card padding="md" className="border-amber-200 bg-amber-50">
            <p className="text-sm text-amber-900">
              {t("location.deniedBrowserHint")}
            </p>
          </Card>
        )}

        {message && (
          <p className="text-sm text-emerald-700" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </SettingsShell>
  );
}
