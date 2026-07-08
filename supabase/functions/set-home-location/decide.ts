// Sprint 10 / Phase 9B — pure decision helper for set-home-location.
// Extracted so the overwrite-refusal contract can be unit-tested without
// mocking Supabase.

export interface HomeLocationInput {
  lat: unknown;
  lng: unknown;
  timezone?: unknown;
  force?: unknown;
  clear?: unknown;
  existing: {
    home_lat: number | null;
    home_lng: number | null;
    home_location_set_at: string | null;
  } | null;
}

export type HomeLocationDecision =
  | { action: "clear" }
  | { action: "invalid"; error: "invalid_coords" }
  | { action: "refused"; error: "already_set" }
  | {
      action: "write";
      lat: number;
      lng: number;
      timezone: string | null;
      changed: boolean;
    };

function isFiniteLat(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -90 && v <= 90;
}
function isFiniteLng(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -180 && v <= 180;
}
function isIanaTz(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z_]+\/[A-Za-z0-9_+\-/]+$/.test(v);
}

export function decideHomeLocation(inp: HomeLocationInput): HomeLocationDecision {
  if (inp.clear === true) return { action: "clear" };
  if (!isFiniteLat(inp.lat) || !isFiniteLng(inp.lng)) {
    return { action: "invalid", error: "invalid_coords" };
  }
  const alreadySet =
    !!inp.existing &&
    (inp.existing.home_location_set_at != null || inp.existing.home_lat != null);
  if (alreadySet && inp.force !== true) {
    return { action: "refused", error: "already_set" };
  }
  return {
    action: "write",
    lat: inp.lat,
    lng: inp.lng,
    timezone: isIanaTz(inp.timezone) ? inp.timezone : null,
    changed: alreadySet,
  };
}