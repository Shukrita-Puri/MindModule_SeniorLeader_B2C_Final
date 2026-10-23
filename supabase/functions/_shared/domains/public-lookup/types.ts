// [KIND: specification] [LAYER: 0] [TIERS: 2] [AUDIENCE: universal]
// Domain types for Layer 0 Public Lookup Service.
// Source: Part 2 Layer 0 (Section 3).

import type { Provenance } from "../../spine/types.ts";

export interface PublicDomainLookupResult {
  domain: string;
  isAccessible: boolean;
  resolvedAtUtc: string;
  title?: string | null;
  description?: string | null;
  organizationName?: string | null;
  inferredSector?: string | null;
  provenance: Provenance;
}

export interface LookupSecurityValidation {
  isValid: boolean;
  error?: string;
  sanitizedUrl?: URL;
}
