// [KIND: service] [LAYER: memory] [TIERS: 0-3] [AUDIENCE: universal]
// MemoryService: Single writer and manager of shared cross-tier memory.
// Source: Knowledge & Memory Spine (Section 9; Decisions 20, 22, 39).

import type { Provenance } from "../../spine/types.ts";
import type {
  CorrectionScope,
  MemoryKind,
  MemoryTier,
  ScopedMemoryKey,
  MemoryRecord,
  EngagementEventPayload,
  ScopedItemCandidate,
  MemoryLookupQuery,
} from "./types.ts";
import {
  CORRECTION_SCOPE_PRECEDENCE,
  SCOPE_KEY_PREFIXES,
  MEMORY_EXPIRY_DAYS,
  MEMORY_TRUST_RANK,
} from "./constants.ts";

/**
 * Normalises a calendar or task title for pattern-matching memory.
 */
export function normaliseTitle(title: string | null | undefined): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 256);
}

/**
 * Stopwords excluded from distinctive token extraction.
 */
const TOKEN_STOPWORDS = new Set([
  "with", "meeting", "call", "review", "team", "weekly", "monthly", "session",
  "sync", "update", "catch", "chat", "from", "into", "your", "this", "that",
  "time", "block", "discussion", "check", "follow", "plan", "planning",
]);

/**
 * Extracts distinctive tokens from a title for pattern learning.
 */
export function extractDistinctiveTokens(title: string | null | undefined): string[] {
  const norm = normaliseTitle(title);
  if (!norm) return [];
  const out: string[] = [];
  for (const tok of norm.split(" ")) {
    if (tok.length < 3) continue;
    if (/^[0-9]+$/.test(tok)) continue;
    if (TOKEN_STOPWORDS.has(tok)) continue;
    if (!out.includes(tok)) out.push(tok);
  }
  return out;
}

/**
 * Builds a standardized scoped memory key string with appropriate prefix.
 */
export function formatScopedKey(scope: CorrectionScope, rawValue: string): string {
  const prefix = SCOPE_KEY_PREFIXES[scope];
  let cleanVal = rawValue.trim().toLowerCase();
  if (cleanVal.startsWith(prefix)) {
    cleanVal = cleanVal.slice(prefix.length);
  }
  const normalized = scope === "TITLE_PATTERN" ? normaliseTitle(cleanVal) : cleanVal;
  return `${prefix}${normalized}`;
}

export class MemoryService {
  private inMemoryStore: Map<string, MemoryRecord> = new Map();

  /**
   * Generates a unique compound key for storage: `${userId}:${scope}:${formattedValue}`.
   */
  private buildStoreKey(userId: string, key: ScopedMemoryKey): string {
    const formatted = formatScopedKey(key.scope, key.value);
    return `${userId}:${key.scope}:${formatted}`;
  }

  /**
   * Records a new memory entry.
   * Enforces Spine Section 9 invariants:
   * 1. Inferred memory NEVER self-graduates to confirmed (isConfirmed must be false unless declared).
   * 2. Inferred memory receives a default 90-day expiry if not specified.
   * 3. Provenance is mandatory on every write.
   */
  public record<T = unknown>(record: MemoryRecord<T>): MemoryRecord<T> {
    if (!record.userId) {
      throw new Error("MemoryService.record: userId is required.");
    }
    if (!record.provenance?.traceId || !record.provenance?.source) {
      throw new Error("MemoryService.record: provenance with traceId and source is mandatory.");
    }

    const nowIso = new Date().toISOString();
    const isDeclared = record.kind === "declared";

    // Non-graduating inferred guard (Spine 9.2)
    let isConfirmed = record.isConfirmed;
    if (record.kind === "inferred") {
      isConfirmed = false; // Inferred memory never graduates without explicit user confirmation
    } else if (isDeclared) {
      isConfirmed = true;
    }

    // Default expiry assignment
    let expiresAtUtc = record.expiresAtUtc ?? null;
    if (!expiresAtUtc && MEMORY_EXPIRY_DAYS[record.kind] !== null) {
      const days = MEMORY_EXPIRY_DAYS[record.kind]!;
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + days);
      expiresAtUtc = expDate.toISOString();
    }

    const standardizedRecord: MemoryRecord<T> = {
      ...record,
      key: {
        scope: record.key.scope,
        value: formatScopedKey(record.key.scope, record.key.value),
      },
      isConfirmed,
      confirmedAtUtc: isConfirmed ? (record.confirmedAtUtc ?? nowIso) : null,
      expiresAtUtc,
      revokedAtUtc: null,
    };

    const storeKey = this.buildStoreKey(record.userId, standardizedRecord.key);
    this.inMemoryStore.set(storeKey, standardizedRecord as MemoryRecord<unknown>);
    return standardizedRecord;
  }

  /**
   * User explicitly confirms an inferred or proposed memory item.
   * This is the ONLY valid path for an inferred memory to graduate to confirmed (Spine 9.2).
   */
  public confirm(userId: string, key: ScopedMemoryKey, atUtc?: string): MemoryRecord | null {
    const storeKey = this.buildStoreKey(userId, key);
    const existing = this.inMemoryStore.get(storeKey);
    if (!existing) return null;

    existing.isConfirmed = true;
    existing.confirmedAtUtc = atUtc ?? new Date().toISOString();
    existing.revokedAtUtc = null;
    return existing;
  }

  /**
   * Revokes (unlearns / undoes) a memory record.
   */
  public revoke(userId: string, key: ScopedMemoryKey): boolean {
    const storeKey = this.buildStoreKey(userId, key);
    const existing = this.inMemoryStore.get(storeKey);
    if (!existing) return false;

    existing.revokedAtUtc = new Date().toISOString();
    return true;
  }

  /**
   * Resolves a calendar or meeting item against all 5 scoped correction tiers.
   * Order of evaluation (narrowest match wins):
   * 1. THIS_EVENT ("event:<id>")
   * 2. THIS_SERIES ("series:<seriesId>")
   * 3. TITLE_PATTERN ("pattern:<normalisedTitle>")
   * 4. PERSON ("person:<email>")
   * 5. ORGANISATION ("org:<domain>")
   */
  public resolveCorrection(
    userId: string,
    candidate: ScopedItemCandidate,
    nowUtc = new Date().toISOString(),
  ): MemoryRecord | null {
    const normalizedTitle = normaliseTitle(candidate.title);

    for (const scope of CORRECTION_SCOPE_PRECEDENCE) {
      let candidateValues: string[] = [];

      switch (scope) {
        case "THIS_EVENT":
          if (candidate.id) candidateValues = [candidate.id];
          break;
        case "THIS_SERIES":
          if (candidate.seriesId) candidateValues = [candidate.seriesId];
          break;
        case "TITLE_PATTERN": {
          const vals: string[] = [];
          if (normalizedTitle) {
            vals.push(normalizedTitle);
            for (const tok of extractDistinctiveTokens(candidate.title)) {
              vals.push(tok);
            }
          }
          candidateValues = vals;
          break;
        }
        case "PERSON":
          if (candidate.attendeeEmails && candidate.attendeeEmails.length > 0) {
            candidateValues = candidate.attendeeEmails;
          }
          break;
        case "ORGANISATION":
          if (candidate.attendeeDomains && candidate.attendeeDomains.length > 0) {
            candidateValues = candidate.attendeeDomains;
          }
          break;
      }

      for (const val of candidateValues) {
        const key: ScopedMemoryKey = { scope, value: val };
        const storeKey = this.buildStoreKey(userId, key);
        const record = this.inMemoryStore.get(storeKey);

        if (record && !record.revokedAtUtc) {
          // Check expiry
          if (record.expiresAtUtc && record.expiresAtUtc < nowUtc) {
            continue; // Expired record
          }
          return record;
        }
      }

      // Secondary check for TITLE_PATTERN substring matches (e.g. pattern "board" inside "quarterly board review")
      if (scope === "TITLE_PATTERN" && normalizedTitle) {
        for (const [sKey, rec] of this.inMemoryStore.entries()) {
          if (sKey.startsWith(`${userId}:TITLE_PATTERN:`) && !rec.revokedAtUtc) {
            if (rec.expiresAtUtc && rec.expiresAtUtc < nowUtc) continue;
            const pat = rec.key.value.replace(/^pattern:/, "");
            if (pat && normalizedTitle.includes(pat)) {
              return rec;
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Previews how many items in candidate list would be affected by a correction before applying.
   * Required for Layer 2 D-L2-11 (one-tap undo / preview wider correction).
   */
  public previewWiderCorrection(
    scope: CorrectionScope,
    value: string,
    candidates: ScopedItemCandidate[],
  ): number {
    const cleanVal = scope === "TITLE_PATTERN" ? normaliseTitle(value) : value.trim().toLowerCase();
    let count = 0;

    for (const item of candidates) {
      switch (scope) {
        case "THIS_EVENT":
          if (item.id === cleanVal) count++;
          break;
        case "THIS_SERIES":
          if (item.seriesId && item.seriesId.toLowerCase() === cleanVal) count++;
          break;
        case "TITLE_PATTERN": {
          const itemNorm = normaliseTitle(item.title);
          if (itemNorm.includes(cleanVal) || cleanVal.includes(itemNorm)) count++;
          break;
        }
        case "PERSON":
          if (
            item.attendeeEmails &&
            item.attendeeEmails.some((e) => e.toLowerCase() === cleanVal)
          ) {
            count++;
          }
          break;
        case "ORGANISATION":
          if (
            item.attendeeDomains &&
            item.attendeeDomains.some((d) => d.toLowerCase() === cleanVal)
          ) {
            count++;
          }
          break;
      }
    }

    return count;
  }

  /**
   * Records an in-app engagement or review event (Layer 0, EN-1 / Spine 9.7).
   */
  public recordEngagement(
    userId: string,
    event: EngagementEventPayload,
  ): MemoryRecord<EngagementEventPayload> {
    const key: ScopedMemoryKey = {
      scope: "THIS_EVENT",
      value: `engagement:${event.ref.kind}:${event.ref.id}:${event.action}:${event.atUtc}`,
    };

    const record: MemoryRecord<EngagementEventPayload> = {
      userId,
      key,
      kind: "behavioural",
      tier: 1, // Today tier
      payload: event,
      isConfirmed: true, // Engagement is confirmed as behaviour (Spine 9.2)
      confirmedAtUtc: event.atUtc,
      provenance: event.provenance,
    };

    return this.record(record);
  }

  /**
   * Query records matching filters.
   */
  public query(filters: MemoryLookupQuery): MemoryRecord[] {
    const nowUtc = new Date().toISOString();
    const results: MemoryRecord[] = [];

    for (const record of this.inMemoryStore.values()) {
      if (record.userId !== filters.userId) continue;
      if (filters.scope && record.key.scope !== filters.scope) continue;
      if (filters.kind && record.kind !== filters.kind) continue;
      if (filters.tier !== undefined && record.tier !== filters.tier) continue;
      if (!filters.includeRevoked && record.revokedAtUtc) continue;
      if (!filters.includeExpired && record.expiresAtUtc && record.expiresAtUtc < nowUtc) continue;

      results.push(record);
    }

    return results;
  }

  /**
   * Storage mapping helper: Maps a ScopedMemoryRecord to an existing `event_category_confirmations` row.
   * Ensures zero database schema migrations (Spine 9.1, 9.3).
   */
  public mapToConfirmationRow(record: MemoryRecord<{ category: string; subcategory?: string; subtypeId?: string }>) {
    return {
      user_id: record.userId,
      title_norm: formatScopedKey(record.key.scope, record.key.value),
      category: record.payload.category,
      subcategory: record.payload.subcategory ?? null,
      subtype_id: record.payload.subtypeId ?? null,
      confirmed_at: record.confirmedAtUtc ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source: record.kind === "declared" ? "user_override" : "inferred_memory",
    };
  }
}
