/**
 * Re-export shim. The implementation moved to `_shared/travel/trip-windows.ts`
 * so `persist-travel-location` (the client-side producer) and this scheduled
 * producer share one trip-window module — a fork would let the two writers
 * disagree about which days are travel days.
 */
export * from "../_shared/travel/trip-windows.ts";
