"use client";

import { useAuth } from "@/hooks/useAuth";
import { isDemoMode } from "@/lib/config";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Admin route gate: wait for the real DB profiles.is_platform_admin flag.
 * Never treats the fallback display profile as a definitive non-admin.
 */
export function useRequirePlatformAdmin() {
  const { isPlatformAdmin, ready, profileReady, profile } = useAuth();
  const router = useRouter();
  const demo = isDemoMode();

  useEffect(() => {
    if (!ready || !profileReady) return;
    if (demo) return;
    // Wait for the DB profile row; never decide from fallback display profile.
    if (!profile) return;
    if (!isPlatformAdmin) {
      router.replace("/profile");
    }
  }, [ready, profileReady, profile, isPlatformAdmin, demo, router]);

  const pending = !ready || !profileReady || (!demo && !profile);
  const allowed = demo || Boolean(profile && isPlatformAdmin);

  return { pending, allowed, demo };
}
