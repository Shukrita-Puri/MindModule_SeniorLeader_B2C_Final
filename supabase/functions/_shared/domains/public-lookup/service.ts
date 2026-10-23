// [KIND: service] [LAYER: 0] [TIERS: 2] [AUDIENCE: universal]
// Public Lookup Service Implementation.
// Source: Part 2 Layer 0 (Section 3).

import type { PublicDomainLookupResult } from "./types.ts";
import type { Provenance } from "../../spine/types.ts";
import { LOOKUP_TIMEOUT_MS } from "./constants.ts";
import { validatePublicLookupTarget } from "./security.ts";

export class PublicLookupService {
  /**
   * Performs a safe, authenticated-less public lookup of an organizational domain.
   * NEVER extracts or persists personal information (Layer 0, Section 3).
   */
  public async lookupDomain(domain: string, traceId: string): Promise<PublicDomainLookupResult> {
    const nowIso = new Date().toISOString();
    const provenance: Provenance = {
      source: "public_lookup_service",
      version: "1.0.0",
      traceId,
      atUtc: nowIso,
    };

    const validation = validatePublicLookupTarget(domain);
    if (!validation.isValid || !validation.sanitizedUrl) {
      return {
        domain,
        isAccessible: false,
        resolvedAtUtc: nowIso,
        provenance,
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

      const resp = await fetch(validation.sanitizedUrl.toString(), {
        method: "GET",
        headers: {
          "User-Agent": "MindModulePublicLookup/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!resp.ok) {
        return {
          domain: validation.sanitizedUrl.hostname,
          isAccessible: false,
          resolvedAtUtc: nowIso,
          provenance,
        };
      }

      const html = await resp.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : null;

      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
      const description = descMatch ? descMatch[1].trim() : null;

      return {
        domain: validation.sanitizedUrl.hostname,
        isAccessible: true,
        resolvedAtUtc: nowIso,
        title,
        description,
        provenance,
      };
    } catch (_) {
      return {
        domain: validation.sanitizedUrl.hostname,
        isAccessible: false,
        resolvedAtUtc: nowIso,
        provenance,
      };
    }
  }
}
