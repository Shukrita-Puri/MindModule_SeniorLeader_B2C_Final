// Historical Replay Runner (Spec §14, Stage D Step 15)
// Runs the V3 classifier alongside legacy resolution over historical events (up to 365 days),
// evaluates parity, logs structured comparison records, and calculates aggregate metrics.

import { resolveEventCategory } from "./resolve-event-category.ts";
import { classifyEventV3 } from "./event-classifier-v3.ts";
import { logShadowParity, type StructuredParityRecord } from "./shadow-parity-logger.ts";
import type { EventCategoryId } from "./event-categories.ts";
import { DEFAULT_MIND_MODULE_CONTEXT, type CompanyContextProfile } from "./relationship-context.ts";

export interface ReplayEventInput {
  id?: string;
  user_id?: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  durationMinutes?: number | null;
  is_all_day?: boolean;
  is_recurring?: boolean;
  attendees?: Array<{
    name?: string | null;
    email?: string | null;
    domain?: string | null;
    isSelf?: boolean;
    isOrganizer?: boolean;
  }>;
  event_category?: string | null;
  event_subcategory?: string | null;
  [key: string]: unknown;
}

export interface ReplayMetrics {
  totalEvents: number;
  identicalMatches: number;
  categoryMatchesSubtypeRefined: number;
  categoryDivergences: number;
  matchRatePercent: number;
  divergenceRatePercent: number;
  legacyCategoryDistribution: Record<string, number>;
  v3CategoryDistribution: Record<string, number>;
  v3StatusDistribution: {
    confirmed: number;
    inferred_high: number;
    inferred_medium: number;
    uncertain: number;
  };
  newPillarsDetected: {
    categoryI_operations: number;
    categoryJ_crisis: number;
  };
}

export interface ReplayReport {
  metrics: ReplayMetrics;
  records: StructuredParityRecord[];
}

export async function runHistoricalReplay(
  events: ReplayEventInput[],
  options: {
    companyContext?: CompanyContextProfile;
    writeParityLog?: boolean;
  } = {}
): Promise<ReplayReport> {
  const companyContext = options.companyContext ?? DEFAULT_MIND_MODULE_CONTEXT;
  const writeParityLog = options.writeParityLog ?? false;

  const metrics: ReplayMetrics = {
    totalEvents: events.length,
    identicalMatches: 0,
    categoryMatchesSubtypeRefined: 0,
    categoryDivergences: 0,
    matchRatePercent: 0,
    divergenceRatePercent: 0,
    legacyCategoryDistribution: {},
    v3CategoryDistribution: {},
    v3StatusDistribution: {
      confirmed: 0,
      inferred_high: 0,
      inferred_medium: 0,
      uncertain: 0,
    },
    newPillarsDetected: {
      categoryI_operations: 0,
      categoryJ_crisis: 0,
    },
  };

  const records: StructuredParityRecord[] = [];

  for (const ev of events) {
    // 1. Legacy classification
    const legacy = resolveEventCategory(ev.title, ev);
    const legacyCat = legacy.categoryId;
    const legacySub = legacy.subtypeId;

    if (legacyCat) {
      metrics.legacyCategoryDistribution[legacyCat] =
        (metrics.legacyCategoryDistribution[legacyCat] ?? 0) + 1;
    }

    // 2. V3 classification
    const v3Stamp = classifyEventV3(ev, { companyContext });
    const v3Cat = v3Stamp.category;
    const v3Sub = v3Stamp.subtype;

    if (v3Cat) {
      metrics.v3CategoryDistribution[v3Cat] =
        (metrics.v3CategoryDistribution[v3Cat] ?? 0) + 1;
    }

    // Status metrics
    const status = v3Stamp.confirmationState;
    if (status in metrics.v3StatusDistribution) {
      metrics.v3StatusDistribution[status as keyof typeof metrics.v3StatusDistribution]++;
    }

    // New pillars detection tracking
    if (v3Cat === "I") metrics.newPillarsDetected.categoryI_operations++;
    if (v3Cat === "J") metrics.newPillarsDetected.categoryJ_crisis++;

    // Divergence comparison
    const isCategoryMatch = legacyCat === v3Cat;
    const isSubtypeMatch = legacySub === v3Sub;

    if (isCategoryMatch && isSubtypeMatch) {
      metrics.identicalMatches++;
    } else if (isCategoryMatch && !isSubtypeMatch) {
      metrics.categoryMatchesSubtypeRefined++;
    } else {
      metrics.categoryDivergences++;
    }

    // Parity record
    if (writeParityLog) {
      const record = await logShadowParity({
        userId: ev.user_id,
        eventId: ev.id,
        title: ev.title,
        legacyCategory: legacyCat,
        legacySubtype: legacySub,
        v3Stamp,
        mode: "replay",
      });
      records.push(record);
    }
  }

  if (events.length > 0) {
    metrics.matchRatePercent = Number(
      (((metrics.identicalMatches + metrics.categoryMatchesSubtypeRefined) / events.length) * 100).toFixed(1)
    );
    metrics.divergenceRatePercent = Number(
      ((metrics.categoryDivergences / events.length) * 100).toFixed(1)
    );
  }

  return { metrics, records };
}
