// [KIND: constants] [LAYER: 0] [TIERS: 2] [AUDIENCE: universal]
// Domain constants for Layer 0 Public Lookup Service.
// Source: Part 2 Layer 0 (Section 3).

/**
 * Strict timeout in milliseconds for external public lookup requests.
 * Reason: 3000ms prevents slow third-party responses from hanging upstream edge functions (Layer 0, Section 3).
 */
export const LOOKUP_TIMEOUT_MS = 3000;

/**
 * Prohibited hostnames and IP ranges for SSRF prevention.
 */
export const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "169.254.169.254", // Cloud metadata service
  "instance-data",
  "kubernetes.default",
]);

/**
 * Max response size in bytes to prevent memory exhaustion attacks.
 * Reason: 512KB is plenty for public meta tags and basic organizational information.
 */
export const MAX_LOOKUP_RESPONSE_BYTES = 512 * 1024;
