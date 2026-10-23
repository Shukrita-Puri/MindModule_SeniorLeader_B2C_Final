// [KIND: step] [LAYER: 1] [TIERS: 0-3] [AUDIENCE: universal]
// Phase 1 Prepare: Canonical parsing, Status, and Memory Check.
// Source: Final Design (§4 Phase 1).

import type { CanonicalCalendarItem, AttendeeSignal } from "../../calendar/types.ts";
import type { Finding } from "../types.ts";
import type { MemoryService } from "../../memory/service.ts";
import { toCanonicalCalendarItem } from "../../calendar/canonical.ts";

export interface PrepareResult {
  item: CanonicalCalendarItem;
  earlyCategory: string | null;
  earlySubtype: string | null;
  earlySource: string | null;
  memoryFindings: Finding[];
  isCancelled: boolean;
}

/**
 * Executes Phase 1 Prepare steps (1.1, 1.2, 1.3).
 */
export function prepareEvent(input: {
  raw: unknown;
  memoryService?: MemoryService | null;
  traceId?: string;
}): PrepareResult {
  const { raw, memoryService, traceId } = input;
  const trace = traceId ?? `trace_${Date.now()}`;

  let item: CanonicalCalendarItem;
  if (
    raw &&
    typeof raw === "object" &&
    "schemaVersion" in raw &&
    (raw as any).schemaVersion === 1 &&
    "identityKey" in raw
  ) {
    item = raw as CanonicalCalendarItem;
  } else {
    item = toCanonicalCalendarItem({
      userId: (raw as any)?.userId ?? (raw as any)?.user_id ?? "unknown_user",
      raw: (raw ?? {}) as any,
      provenance: {
        source: "prepare_step",
        version: "1.0.0",
        traceId: trace,
      },
    });
  }

  // 1.2 Status check (cancelled or declined)
  if (item.status === "cancelled" || item.userReply === "declined") {
    return {
      item,
      earlyCategory: null,
      earlySubtype: null,
      earlySource: "status_cancelled",
      memoryFindings: [],
      isCancelled: true,
    };
  }

  const memoryFindings: Finding[] = [];

  // 1.3 Scoped memory lookup
  if (memoryService && item.userId) {
    const candidate = {
      id: item.externalId,
      seriesId: item.seriesId,
      title: item.title,
      attendeeEmails: item.attendees.map((a: AttendeeSignal) => a.email).filter(Boolean) as string[],
      attendeeDomains: item.attendees.map((a: AttendeeSignal) => a.domain).filter(Boolean) as string[],
    };

    const hit = memoryService.resolveCorrection(item.userId, candidate);
    if (hit && !hit.revokedAtUtc) {
      const payload = hit.payload as any;
      if (payload && payload.category) {
        // If confirmed by user (declared), finish the job early
        if (hit.isConfirmed || hit.kind === "declared") {
          return {
            item,
            earlyCategory: payload.category,
            earlySubtype: payload.subtypeId ?? null,
            earlySource: `confirmed_memory:${hit.key.scope}`,
            memoryFindings: [],
            isCancelled: false,
          };
        }

        // Inferred memory adds a memory finding
        memoryFindings.push({
          type: "label",
          value: payload.category,
          family: "memory",
          strength: "medium",
          sourceTrust: "history",
          source: `inferred_memory:${hit.key.scope}`,
          description: `Previously inferred category ${payload.category}`,
        });
      }
    }
  }

  return {
    item,
    earlyCategory: null,
    earlySubtype: null,
    earlySource: null,
    memoryFindings,
    isCancelled: false,
  };
}
