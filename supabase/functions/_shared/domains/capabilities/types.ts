// [KIND: specification] [LAYER: 0] [TIERS: 0] [AUDIENCE: universal]
// Domain types for Layer 0 Capabilities & Connector Health.
// Source: Part 2 Layer 0 (Section 10, 12.1).

import type { Provenance } from "../../spine/types.ts";

export interface ProviderState {
  state: "not_connected" | "connected" | "needs_reconnect" | "error" | "rate_limited";
  lastSuccessUtc: string | null;
  freshness: "fresh" | "stale" | "unknown";
}

export interface CapabilityFlags {
  schemaVersion: 1;
  userId: string;
  calendar: Record<"google" | "microsoft" | "apple", ProviderState>;
  wearable: Record<"apple_health" | "oura" | "whoop" | "health_connect", ProviderState>;
  location: {
    permitted: boolean;
    lastReadingUtc: string | null;
  };
  declaredIntent: {
    calendars: string[];
    wearables: string[];
  };
  hasCalendar: boolean;
  hasWearable: boolean;
  hasLocation: boolean;
  provenance: Provenance;
}

export type {
  GoogleCalendarErrorKind,
  GoogleCalendarErrorClassification,
} from "./google-errors.ts";

export type {
  MicrosoftCalendarErrorKind,
  MicrosoftCalendarErrorClassification,
} from "./microsoft-errors.ts";

export type {
  MicrosoftSubscriptionCreatePayload,
  MicrosoftSubscriptionRenewPayload,
  MicrosoftSubscriptionErrorKind,
  GraphNotification,
  GraphNotificationEnvelope,
} from "./subscription.ts";

export type {
  QuotaScopeInput,
  QuotaCooldownRow,
  QuotaCooldownUpsertInput,
  QuotaCooldownUpsertRow,
} from "./quota.ts";

export type {
  RateLimitedUpdate,
  SuccessfulSyncUpdate,
  AuthFailureUpdate,
  GenericErrorUpdate,
} from "./connection-state.ts";

export type {
  WatchIntegrationInput,
  NormalizedWatchStatus,
} from "./watch-status.ts";

export type {
  SyncTokenPhase,
} from "./token-outcome.ts";
