/** Client-only Geolocation API wrapper — call only after explicit user action. */

export type GeoPositionResult =
  | {
      ok: true;
      latitude: number;
      longitude: number;
      accuracy: number | null;
    }
  | {
      ok: false;
      code: "UNSUPPORTED" | "PERMISSION_DENIED" | "POSITION_UNAVAILABLE" | "TIMEOUT" | "UNKNOWN";
      message: string;
    };

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 60_000,
};

export function isGeolocationSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.geolocation?.getCurrentPosition === "function"
  );
}

export function getCurrentPosition(
  options: PositionOptions = DEFAULT_OPTIONS
): Promise<GeoPositionResult> {
  if (!isGeolocationSupported()) {
    return Promise.resolve({
      ok: false,
      code: "UNSUPPORTED",
      message: "Geolocation is not supported in this browser",
    });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          ok: true,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:
            typeof pos.coords.accuracy === "number" &&
            Number.isFinite(pos.coords.accuracy)
              ? pos.coords.accuracy
              : null,
        });
      },
      (err) => {
        const code =
          err.code === err.PERMISSION_DENIED
            ? "PERMISSION_DENIED"
            : err.code === err.POSITION_UNAVAILABLE
              ? "POSITION_UNAVAILABLE"
              : err.code === err.TIMEOUT
                ? "TIMEOUT"
                : "UNKNOWN";
        resolve({
          ok: false,
          code,
          message: err.message || code,
        });
      },
      { ...DEFAULT_OPTIONS, ...options }
    );
  });
}
