// MRS v2 — daily_context_snapshot upsert helper.
//
// Two layers:
//   1. `upsertDailyContextSnapshot` — low-level idempotent writer. Used by
//      compute-outer-readiness which already has every signal in-hand and
//      should not re-query.
//   2. `composeDailyContext` — orchestrator. Fetches RawSignals from the DB,
//      runs pattern-engine + demand-scorer + strategic-context, and writes
//      via the low-level upsert. Used by cron jobs and Brief/Nudges/Plan
//      callers that need a fresh snapshot but don't own the compute pipeline.
//
// Every fetch is null-safe. Missing wearable → empty hrv arrays; missing
// calendar → empty events. The orchestrator never throws — failures degrade
// to a partial snapshot so readiness keeps flowing (Core memory: DB is the
// source of truth, but a missing signal must never block the score).

import type {
  DailyContextSnapshot,
  ClassifiedEventLite,
  DemandLevel,
  DivergenceFlag,
  PatternSignals,
  RawSignals,
  StrategicContext,
  WeightingMode,
} from './types.ts';
import { buildPatternSignals } from './pattern-engine.ts';
import { computeCalendarDemand } from './demand-scorer.ts';
import { resolveStrategicContext } from './strategic-context.ts';

type AnySupabase = {
  from: (table: string) => any;
};

export interface UpsertContextSnapshotInput {
  userId: string;
  localDate: string;
  patternSignals: PatternSignals | null;
  strategicContext: StrategicContext | null;
  calendarDemandScore: number | null;
  demandLoad: DemandLevel | null;
  demandPressure: DemandLevel | null;
  hasHighStakes: boolean;
  innerScore: number | null;
  innerTier: string | null;
  pillarMode: string | null;
  weightingMode: WeightingMode | null;
  supplyDemandGapFlag: DivergenceFlag | null;
  signalPills: unknown | null;
  // MRS v3 — soft-guard tier cap (see compute-inner-readiness §tier-cap).
  tierDisplayed?: string | null;
  tierCapReason?: 'SUSTAINED_DEFICIT' | 'CONSECUTIVE_LOAD' | null;
  // MRS v3 §3.3 — refined-score split. `readinessScoreBaseline` is the raw
  // State 1 value; `readinessScoreRefined` is null until a Mind Check-in
  // exists for the window. `readinessState` is 'baseline' | 'refined'.
  readinessScoreBaseline?: number | null;
  readinessScoreRefined?: number | null;
  readinessState?: 'baseline' | 'refined' | null;
  refinedContribution?: number | null;
  // MRS v4 §11 — additive columns. All optional for back-compat with
  // callers still on the v3 path; the v4 cron path supplies them.
  mrsWindow?: 'morning' | 'afternoon' | 'evening' | null;
  morningBaselineScore?: number | null;
  checkInCountToday?: number | null;
  lastCheckInWindow?: 'morning' | 'afternoon' | 'evening' | null;
  weightProvenance?: unknown | null;
}

/**
 * Upsert the daily context snapshot for (user_id, local_date).
 * Idempotent. Service-role only (writes are blocked by RLS for everyone else).
 * Failures are logged but never thrown — readiness must keep flowing.
 */
export async function upsertDailyContextSnapshot(
  db: AnySupabase,
  input: UpsertContextSnapshotInput,
): Promise<void> {
  try {
    const row: Partial<DailyContextSnapshot> & { user_id: string; local_date: string } = {
      user_id: input.userId,
      local_date: input.localDate,
      pattern_signals: input.patternSignals,
      strategic_context: input.strategicContext,
      calendar_demand_score: input.calendarDemandScore,
      demand_load: input.demandLoad,
      demand_pressure: input.demandPressure,
      has_high_stakes: input.hasHighStakes,
      inner_score: input.innerScore,
      inner_tier: input.innerTier,
      pillar_mode: input.pillarMode,
      weighting_mode: input.weightingMode,
      supply_demand_gap_flag: input.supplyDemandGapFlag,
      signal_pills: input.signalPills,
      tier_displayed: input.tierDisplayed ?? input.innerTier ?? null,
      tier_cap_reason: input.tierCapReason ?? null,
      // MRS v3 §3.3 — refined-score split mirror.
      readiness_score_baseline: input.readinessScoreBaseline ?? null,
      readiness_score_refined: input.readinessScoreRefined ?? null,
      readiness_state: input.readinessState ?? null,
      refined_contribution: input.refinedContribution ?? null,
    };

    // MRS v4 §11 — only write the additive columns when the caller has
    // supplied them. Avoids clobbering existing values on rows being updated
    // by an older v3-path caller within the same cron cycle.
    if (input.mrsWindow !== undefined) (row as any).mrs_window = input.mrsWindow;
    if (input.morningBaselineScore !== undefined) (row as any).morning_baseline_score = input.morningBaselineScore;
    if (input.checkInCountToday !== undefined) (row as any).check_in_count_today = input.checkInCountToday;
    if (input.lastCheckInWindow !== undefined) (row as any).last_check_in_window = input.lastCheckInWindow;
    if (input.weightProvenance !== undefined) (row as any).weight_provenance = input.weightProvenance;

    const { error } = await db
      .from('daily_context_snapshot')
      .upsert(row, { onConflict: 'user_id,local_date' });

    if (error) {
      console.warn('[daily_context_snapshot] upsert failed:', error.message ?? error);
    }
  } catch (err) {
    console.warn(
      '[daily_context_snapshot] upsert threw:',
      err instanceof Error ? err.message : err,
    );
  }
}

// ============================================================================
// Orchestrator
// ============================================================================

export interface ComposeDailyContextOptions {
  /** IANA timezone for `localDate` day-boundary math. Defaults to UTC. */
  timezone?: string;
  /** When true, skip the upsert and just return the composed snapshot. */
  dryRun?: boolean;
}

export interface ComposeDailyContextResult {
  patternSignals: PatternSignals;
  strategicContext: StrategicContext;
  calendarDemandScore: number;
  demandLoad: DemandLevel;
  demandPressure: DemandLevel;
  hasHighStakes: boolean;
  rawSignals: RawSignals;
}

/**
 * Compose + persist the daily context snapshot for `(userId, localDate)`.
 *
 * Score-affecting fields (`inner_score`, `inner_tier`, `weighting_mode`,
 * `supply_demand_gap_flag`, `pillar_mode`, `signal_pills`) are intentionally
 * left null here — they're owned by compute-outer-readiness which writes
 * them on the same `(user_id, local_date)` row. This orchestrator only
 * guarantees the *context* half of the snapshot is fresh.
 */
export async function composeDailyContext(
  db: AnySupabase,
  userId: string,
  localDate: string,
  opts: ComposeDailyContextOptions = {},
): Promise<ComposeDailyContextResult> {
  const [hrvBundle, todayEvents, loadLast3Days, dowHistory, strategicContext] =
    await Promise.all([
      fetchHrvBundle(db, userId, localDate),
      fetchTodayEvents(db, userId, localDate),
      fetchLoadLast3Days(db, userId, localDate),
      fetchDowHistory(db, userId, localDate),
      resolveStrategicContext(db, userId).catch((): StrategicContext => ({
        pressure_profile: null,
        protection_goals: null,
        user_archetype: null,
      })),
    ]);

  // MRS v4 — short RHR baseline (no schema change). Computed from existing
  // wearable_data rows; null when <3 days of RHR present, which §8.2 treats
  // as "intradayHrDeviation / eveningPhysioRead unavailable" (so their
  // weight redistributes — never collapses to a neutral default).
  const rhrBaseline3d = await fetchRhrBaseline3d(db, userId, localDate);

  const raw: RawSignals = {
    hrvToday: hrvBundle.hrvToday,
    hrvBaseline30d: hrvBundle.hrvBaseline30d,
    hrvRecent: hrvBundle.hrvRecent,
    loadLast3Days,
    dowHistory,
    rhrBaseline3d,
  };

  const demand = computeCalendarDemand(todayEvents);
  const patternSignals = buildPatternSignals(raw, todayEvents);

  if (!opts.dryRun) {
    await upsertDailyContextSnapshot(db, {
      userId,
      localDate,
      patternSignals,
      strategicContext,
      calendarDemandScore: demand.demandScore,
      demandLoad: demand.load,
      demandPressure: demand.pressure,
      hasHighStakes: demand.hasHighStakes,
      // Score-side fields are owned by compute-outer-readiness — leave null
      // so we don't accidentally overwrite a fresher value from that path.
      innerScore: null,
      innerTier: null,
      pillarMode: null,
      weightingMode: null,
      supplyDemandGapFlag: null,
      signalPills: null,
    });
  }

  return {
    patternSignals,
    strategicContext,
    calendarDemandScore: demand.demandScore,
    demandLoad: demand.load,
    demandPressure: demand.pressure,
    hasHighStakes: demand.hasHighStakes,
    rawSignals: raw,
  };
}

// ─── Fetchers ────────────────────────────────────────────────────────────
// Every fetcher swallows its own errors and returns a safe default. The
// orchestrator must never throw — a missing signal degrades gracefully.

interface HrvBundle {
  hrvToday: number | null;
  hrvBaseline30d: number | null;
  hrvRecent: Array<{ date: string; hrv: number }>;
}

async function fetchHrvBundle(
  db: AnySupabase,
  userId: string,
  localDate: string,
): Promise<HrvBundle> {
  const empty: HrvBundle = { hrvToday: null, hrvBaseline30d: null, hrvRecent: [] };
  try {
    const from30 = isoDayShift(localDate, -30);
    const { data, error } = await db
      .from('wearable_data')
      .select('summary_date, hrv')
      .eq('user_id', userId)
      .gte('summary_date', from30)
      .lte('summary_date', localDate)
      .order('summary_date', { ascending: false });

    if (error || !Array.isArray(data) || data.length === 0) return empty;

    const rows = (data as Array<{ summary_date: string; hrv: number | null }>)
      .filter((r) => r.hrv != null && Number.isFinite(Number(r.hrv)))
      .map((r) => ({ date: r.summary_date, hrv: Number(r.hrv) }));

    if (rows.length === 0) return empty;

    const hrvToday = rows.find((r) => r.date === localDate)?.hrv ?? rows[0]?.hrv ?? null;
    const baseline =
      rows.length > 0 ? rows.reduce((s, r) => s + r.hrv, 0) / rows.length : null;

    // Pattern engine wants the trailing ~14d window, most recent first.
    const hrvRecent = rows.slice(0, 14);

    return {
      hrvToday,
      hrvBaseline30d: baseline != null ? Math.round(baseline) : null,
      hrvRecent,
    };
  } catch {
    return empty;
  }
}

async function fetchTodayEvents(
  db: AnySupabase,
  userId: string,
  localDate: string,
): Promise<ClassifiedEventLite[]> {
  try {
    const { start, end } = dayBoundsUtc(localDate);
    const { data, error } = await db
      .from('primary_calendar_events')
      .select(
        'start_time, end_time, is_organizer, attendees_count, is_recurring, title, event_metadata',
      )
      .eq('user_id', userId)
      .gte('start_time', start)
      .lte('start_time', end);
    if (error || !Array.isArray(data)) return [];
    return (data as ClassifiedEventLite[]).map(normalizeEvent);
  } catch {
    return [];
  }
}

async function fetchLoadLast3Days(
  db: AnySupabase,
  userId: string,
  localDate: string,
): Promise<DemandLevel[]> {
  // Per-day loads for [D-2, D-1, D] (most recent last). Each day's events
  // are scored through the shared demand-scorer so a single source of truth
  // governs load classification everywhere.
  const out: DemandLevel[] = [];
  for (let offset = -2; offset <= 0; offset++) {
    const day = isoDayShift(localDate, offset);
    try {
      const { start, end } = dayBoundsUtc(day);
      const { data } = await db
        .from('primary_calendar_events')
        .select(
          'start_time, end_time, is_organizer, attendees_count, is_recurring, title, event_metadata',
        )
        .eq('user_id', userId)
        .gte('start_time', start)
        .lte('start_time', end);
      const events = Array.isArray(data) ? (data as ClassifiedEventLite[]).map(normalizeEvent) : [];
      out.push(computeCalendarDemand(events).load);
    } catch {
      out.push('low');
    }
  }
  return out;
}

async function fetchDowHistory(
  db: AnySupabase,
  userId: string,
  localDate: string,
): Promise<Array<{ date: string; dow: number; hrv: number | null; load: DemandLevel | null }>> {
  // 60-day join of wearable HRV by day + calendar load by day, grouped by
  // day-of-week. We fetch both raw streams and join in memory — pattern
  // engine handles the day-of-week aggregation.
  try {
    const from60 = isoDayShift(localDate, -60);
    const [{ data: wear }, { data: events }] = await Promise.all([
      db
        .from('wearable_data')
        .select('summary_date, hrv')
        .eq('user_id', userId)
        .gte('summary_date', from60)
        .lt('summary_date', localDate),
      db
        .from('primary_calendar_events')
        .select(
          'start_time, end_time, is_organizer, attendees_count, is_recurring, title, event_metadata',
        )
        .eq('user_id', userId)
        .gte('start_time', dayBoundsUtc(from60).start)
        .lt('start_time', dayBoundsUtc(localDate).start),
    ]);

    // HRV per day.
    const hrvByDay = new Map<string, number>();
    for (const r of (wear ?? []) as Array<{ summary_date: string; hrv: number | null }>) {
      if (r.hrv != null && Number.isFinite(Number(r.hrv))) {
        hrvByDay.set(r.summary_date, Number(r.hrv));
      }
    }

    // Group events by local day (UTC date of start_time — close enough for
    // DOW aggregation; absolute precision isn't needed at the day-of-week level).
    const eventsByDay = new Map<string, ClassifiedEventLite[]>();
    for (const ev of (events ?? []) as ClassifiedEventLite[]) {
      const day = (ev.start_time || '').slice(0, 10);
      if (!day) continue;
      const arr = eventsByDay.get(day) ?? [];
      arr.push(normalizeEvent(ev));
      eventsByDay.set(day, arr);
    }

    const allDays = new Set<string>([...hrvByDay.keys(), ...eventsByDay.keys()]);
    const out: Array<{ date: string; dow: number; hrv: number | null; load: DemandLevel | null }> = [];
    for (const day of allDays) {
      const dow = new Date(day + 'T00:00:00Z').getUTCDay();
      if (Number.isNaN(dow)) continue;
      const hrv = hrvByDay.get(day) ?? null;
      const dayEvents = eventsByDay.get(day) ?? [];
      const load = dayEvents.length > 0 ? computeCalendarDemand(dayEvents).load : null;
      out.push({ date: day, dow, hrv, load });
    }
    return out;
  } catch {
    return [];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function normalizeEvent(e: any): ClassifiedEventLite {
  return {
    start_time: String(e.start_time),
    end_time: String(e.end_time),
    is_organizer: !!e.is_organizer,
    attendees_count: typeof e.attendees_count === 'number' ? e.attendees_count : 0,
    is_recurring: !!e.is_recurring,
    title: e.title ?? null,
    event_metadata: e.event_metadata ?? null,
  };
}

/** Shift an ISO date (YYYY-MM-DD) by N days. Pure UTC arithmetic. */
function isoDayShift(localDate: string, days: number): string {
  const t = new Date(localDate + 'T00:00:00Z').getTime();
  const shifted = new Date(t + days * 86400000);
  return shifted.toISOString().slice(0, 10);
}

/** UTC day bounds for `YYYY-MM-DD`. Returns ISO strings. */
function dayBoundsUtc(localDate: string): { start: string; end: string } {
  const start = new Date(localDate + 'T00:00:00Z').toISOString();
  const end = new Date(localDate + 'T23:59:59.999Z').toISOString();
  return { start, end };
}

// MRS v4 §8.2 — trailing 3-day RHR baseline. No schema change: computed
// each cycle from existing `wearable_data.resting_heart_rate` rows.
// Returns `null` when fewer than 3 days of RHR data exist; downstream
// sub-components mark themselves `available=false` and §8.3 handles the
// redistribution. Errors degrade to `null` — never throws.
async function fetchRhrBaseline3d(
  db: AnySupabase,
  userId: string,
  localDate: string,
): Promise<number | null> {
  try {
    const from3 = (() => {
      const t = new Date(localDate + 'T00:00:00Z').getTime();
      return new Date(t - 3 * 86400000).toISOString().slice(0, 10);
    })();
    const { data, error } = await db
      .from('wearable_data')
      .select('resting_heart_rate, summary_date')
      .eq('user_id', userId)
      .gte('summary_date', from3)
      .lte('summary_date', localDate)
      .order('summary_date', { ascending: false });
    if (error || !Array.isArray(data)) return null;
    const rhrs = (data as Array<{ resting_heart_rate: number | null }>)
      .map((r) => (typeof r.resting_heart_rate === 'number' ? r.resting_heart_rate : null))
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (rhrs.length < 3) return null;
    const avg = rhrs.reduce((s, v) => s + v, 0) / rhrs.length;
    return Math.round(avg * 10) / 10;
  } catch {
    return null;
  }
}