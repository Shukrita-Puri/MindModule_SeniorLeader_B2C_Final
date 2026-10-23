// [KIND: implementation] [LAYER: 0] [TIERS: 0] [AUDIENCE: universal]
// Capability Flags Builder.
// Source: Part 2 Layer 0 (Section 10, 12.1).

import type { CapabilityFlags, ProviderState } from "./types.ts";
import type { Provenance } from "../../spine/types.ts";

export function defaultProviderState(): ProviderState {
  return {
    state: "not_connected",
    lastSuccessUtc: null,
    freshness: "unknown",
  };
}

export function buildCapabilityFlags(input: {
  userId: string;
  calendar?: Partial<Record<"google" | "microsoft" | "apple", ProviderState>>;
  wearable?: Partial<Record<"apple_health" | "oura" | "whoop" | "health_connect", ProviderState>>;
  location?: { permitted: boolean; lastReadingUtc: string | null };
  declaredIntent?: { calendars?: string[]; wearables?: string[] };
  provenance: Provenance;
}): CapabilityFlags {
  const { userId, calendar, wearable, location, declaredIntent, provenance } = input;

  const calRecord: Record<"google" | "microsoft" | "apple", ProviderState> = {
    google: calendar?.google ?? defaultProviderState(),
    microsoft: calendar?.microsoft ?? defaultProviderState(),
    apple: calendar?.apple ?? defaultProviderState(),
  };

  const wearRecord: Record<"apple_health" | "oura" | "whoop" | "health_connect", ProviderState> = {
    apple_health: wearable?.apple_health ?? defaultProviderState(),
    oura: wearable?.oura ?? defaultProviderState(),
    whoop: wearable?.whoop ?? defaultProviderState(),
    health_connect: wearable?.health_connect ?? defaultProviderState(),
  };

  const hasCalendar = Object.values(calRecord).some((p) => p.state === "connected");
  const hasWearable = Object.values(wearRecord).some((p) => p.state === "connected");
  const hasLocation = Boolean(location?.permitted);

  return {
    schemaVersion: 1,
    userId,
    calendar: calRecord,
    wearable: wearRecord,
    location: {
      permitted: hasLocation,
      lastReadingUtc: location?.lastReadingUtc ?? null,
    },
    declaredIntent: {
      calendars: declaredIntent?.calendars ?? [],
      wearables: declaredIntent?.wearables ?? [],
    },
    hasCalendar,
    hasWearable,
    hasLocation,
    provenance,
  };
}
