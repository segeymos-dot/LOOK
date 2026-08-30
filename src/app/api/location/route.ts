import { getFinanceApiUser } from "@/lib/api/finance-auth";
import type {
  LocationPermissionState,
  LocationSource,
  ProfileLocation,
} from "@/lib/location/types";
import { NextResponse } from "next/server";
import { z } from "zod";

const LOCATION_SELECT = `
  latitude, longitude, location_accuracy_m,
  country_code, country, region, city,
  location_source, location_permission_state, location_updated_at
`;

const gpsSchema = z.object({
  mode: z.literal("gps"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy_m: z.number().min(0).max(100_000).nullable().optional(),
  country_code: z.string().max(8).nullable().optional(),
  country: z.string().max(120).nullable().optional(),
  region: z.string().max(120).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  permission_state: z.enum(["granted", "denied", "prompt"]).optional(),
});

const manualSchema = z.object({
  mode: z.literal("manual"),
  country: z.string().max(120).nullable().optional(),
  region: z.string().max(120).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  country_code: z.string().max(8).nullable().optional(),
});

const permissionOnlySchema = z.object({
  mode: z.literal("permission"),
  permission_state: z.enum(["granted", "denied", "prompt"]),
});

const schema = z.discriminatedUnion("mode", [
  gpsSchema,
  manualSchema,
  permissionOnlySchema,
]);

function asLocation(row: Record<string, unknown> | null): ProfileLocation | null {
  if (!row) return null;
  return {
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    location_accuracy_m:
      row.location_accuracy_m != null ? Number(row.location_accuracy_m) : null,
    country_code: (row.country_code as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    region: (row.region as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    location_source: (row.location_source as LocationSource | null) ?? null,
    location_permission_state:
      (row.location_permission_state as LocationPermissionState | null) ?? null,
    location_updated_at: (row.location_updated_at as string | null) ?? null,
  };
}

export async function GET(request: Request) {
  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("profiles")
    .select(LOCATION_SELECT)
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    location: asLocation(data as Record<string, unknown> | null),
  });
}

/**
 * Update own location only (auth.uid() via RLS).
 * Never accepts a target user id — no cross-user writes.
 */
export async function PATCH(request: Request) {
  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  let patch: Record<string, unknown>;

  if (parsed.data.mode === "permission") {
    patch = {
      location_permission_state: parsed.data.permission_state,
      updated_at: now,
    };
  } else if (parsed.data.mode === "gps") {
    patch = {
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      location_accuracy_m: parsed.data.accuracy_m ?? null,
      country_code: parsed.data.country_code?.trim() || null,
      country: parsed.data.country?.trim() || null,
      region: parsed.data.region?.trim() || null,
      city: parsed.data.city?.trim() || null,
      location_source: "gps" as LocationSource,
      location_permission_state:
        parsed.data.permission_state ?? ("granted" as LocationPermissionState),
      location_updated_at: now,
      updated_at: now,
    };
  } else {
    // Manual — clear precise GPS so we do not mix sources.
    patch = {
      latitude: null,
      longitude: null,
      location_accuracy_m: null,
      country_code: parsed.data.country_code?.trim() || null,
      country: parsed.data.country?.trim() || null,
      region: parsed.data.region?.trim() || null,
      city: parsed.data.city?.trim() || null,
      location_source: "manual" as LocationSource,
      location_updated_at: now,
      updated_at: now,
    };
  }

  const { data, error } = await auth.supabase
    .from("profiles")
    .update(patch)
    .eq("id", auth.user.id)
    .select(LOCATION_SELECT)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    location: asLocation(data as Record<string, unknown> | null),
  });
}
