"use client";

import { LocationPrompt } from "@/components/location/LocationPrompt";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { getCurrentPosition } from "@/lib/location/browser-geolocation";
import {
  dismissLocationPromptThisSession,
  isLocationPromptDismissedThisSession,
  markLocationPromptAsked,
  wasLocationPromptAsked,
} from "@/lib/location/prompt-state";
import { formatLocationLabel } from "@/lib/location/types";
import { isDemoMode } from "@/lib/config";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

/**
 * First-use LOOK location prompt for registered users.
 * Never calls navigator.geolocation until the user taps Allow.
 */
export function LocationPromptHost() {
  const { t, locale } = useTranslation();
  const { user, ready, profileReady, profile, refreshProfile, isPlatformAdmin } =
    useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deniedHint, setDeniedHint] = useState(false);

  useEffect(() => {
    if (!ready || !profileReady || !user || isDemoMode()) return;
    if (isPlatformAdmin) return;

    const perm = profile?.location_permission_state;
    if (perm === "granted" || perm === "denied" || perm === "prompt") return;
    if (isLocationPromptDismissedThisSession()) return;
    if (wasLocationPromptAsked()) return;

    const timer = window.setTimeout(() => setOpen(true), 800);
    return () => window.clearTimeout(timer);
  }, [
    ready,
    profileReady,
    user,
    isPlatformAdmin,
    profile?.location_permission_state,
  ]);

  const onNotNow = useCallback(() => {
    dismissLocationPromptThisSession();
    markLocationPromptAsked();
    setOpen(false);
    void authFetch("/api/location", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "permission", permission_state: "prompt" }),
    }).catch(() => undefined);
  }, []);

  const onAllow = useCallback(async () => {
    setLoading(true);
    markLocationPromptAsked();
    try {
      const pos = await getCurrentPosition();
      if (!pos.ok) {
        const denied = pos.code === "PERMISSION_DENIED";
        setOpen(false);
        if (denied) {
          setDeniedHint(true);
          await authFetch("/api/location", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "permission",
              permission_state: "denied",
            }),
          });
        } else {
          setToast(t("location.unavailable"));
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
      const saveJson = await saveRes.json().catch(() => ({}));
      setOpen(false);
      if (!saveRes.ok || !saveJson.success) {
        setToast(t("location.saveError"));
        return;
      }
      await refreshProfile();
      const label =
        formatLocationLabel({
          city: place.city ?? null,
          region: place.region ?? null,
          country: place.country ?? null,
        }) || t("location.detectedGeneric");
      setToast(t("location.detected", { place: label }));
    } catch {
      setOpen(false);
      setToast(t("location.saveError"));
    } finally {
      setLoading(false);
    }
  }, [locale, refreshProfile, t]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(id);
  }, [toast]);

  return (
    <>
      <LocationPrompt
        open={open}
        loading={loading}
        onAllow={() => void onAllow()}
        onNotNow={onNotNow}
      />
      {(toast || deniedHint) && (
        <div className="fixed bottom-24 left-1/2 z-50 w-[min(100%-2rem,28rem)] -translate-x-1/2 rounded-2xl border border-border-subtle bg-surface p-4 shadow-lg">
          {deniedHint ? (
            <div className="space-y-2">
              <p className="text-sm text-text-primary">{t("location.deniedBody")}</p>
              <Link
                href="/settings/location"
                className="text-sm font-medium text-brand-700 underline"
                onClick={() => setDeniedHint(false)}
              >
                {t("location.openSettings")}
              </Link>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-text-primary">{toast}</p>
              <Link
                href="/settings/location"
                className="shrink-0 text-sm font-medium text-brand-700"
              >
                {t("location.change")}
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
