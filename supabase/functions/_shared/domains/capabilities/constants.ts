// [KIND: constants] [LAYER: 0] [TIERS: 0] [AUDIENCE: universal]
// Domain constants for Layer 0 Capabilities & Connector Resilience.
// Source: Part 2 Layer 0 (Section 10, 12.1), rules/*.ts.

export {
  MS_GRAPH_SUB_MAX_MINUTES,
  MS_GRAPH_RENEW_WINDOW_MS,
} from "./subscription.ts";

export {
  RETRY_HINT_MIN_SECONDS,
  RETRY_HINT_MAX_SECONDS,
  RETRY_HINT_DEFAULT_SECONDS,
  RETRY_BACKOFF_LADDER_SECONDS,
  RETRY_JITTER_RATIO,
  RETRY_JITTER_MIN_SECONDS,
  RETRY_JITTER_MAX_SECONDS,
} from "./connection-state.ts";

export { UNKNOWN_CLIENT_FALLBACK } from "./quota.ts";
