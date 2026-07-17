/**
 * PillDetailContent — Signal Pills v3 inline detail panel.
 *
 * MRS v3 attribution (docs/MRS_V3_SPECIFICATION.md):
 *   Decision Readiness    → HRV, sleep duration, sleep score, clarity
 *   Physical Reserves     → RHR, HR, RHR 3-day trend
 *   Resilience Capacity   → sleep efficiency, emotion, regulation, pressure,
 *                           sustained deficit, HRV × high-demand co-occurrence,
 *                           protection-goals framing
 *
 * Contract: every contributor key is rendered via a human label map. Pattern
 * data (3-day trends, vs-baseline %, peak streaks, low-day streaks) is shown
 * inline in muted grey italic brackets next to its metric — never as a
 * separate backend-style row. The pill chip above the expanded panel already
 * owns label + tier display, so the panel itself no longer repeats them.
 * Sleep duration / sleep score belong ONLY to Decision Readiness; Physical
 * Reserves expects RHR + HR. Mind dimensions render as exactly one row per
 * dim, merging the raw value and the pattern qualifier.
 */

type PillTier = 'green' | 'amber' | 'red' | 'neutral';

import { formatDisplayValue, isUnsafeObjectText } from '@/utils/safeDisplayValue';

/**
 * Pill keys whose "expected missing" fallback rows can create a
 * contradictory display when the tier is positive but no real contributor
 * values exist (e.g. tier="Body Steady" while every row reads "No data
 * available"). For these pills, when the tier is non-neutral but zero
 * displayable contributor rows resolve, we render a single neutral line
 * instead of a wall of fake missing rows.
 */
const NEUTRAL_FALLBACK_ON_EMPTY: Record<
  'decision_readiness' | 'physical_reserves' | 'resilience_capacity',
  string
> = {
  decision_readiness: 'Mind detail not available for this reading.',
  physical_reserves: 'Body detail not available for this reading.',
  resilience_capacity: 'Reserve detail not available for this reading.',
};

export interface PillTooltipPill {
  key: 'decision_readiness' | 'physical_reserves' | 'resilience_capacity';
  label: string;
  tier: PillTier;
  tierLabel?: string;
  contributors?: Record<string, unknown>;
  qualifiers?: Record<string, unknown>;
  // MRS V4 — per-pill source-of-truth metadata. When `isScoreBearing` is
  // false the pill must not display a "(Refined)" badge or coloured tier;
  // `hiddenReason` explains why (no fresh wearable / no check-in).
  sourceTypes?: Array<'wearable' | 'checkin' | 'pattern'>;
  isScoreBearing?: boolean;
  freshness?: 'fresh' | 'stale' | 'missing' | 'non_score_bearing';
  hiddenReason?: 'no_fresh_wearable' | 'no_checkin' | null;
  detail?: string | null;
  contributedByCheckIn?: boolean;
}

/* ── Humanisation ────────────────────────────────────────────────────── */

// Whitelist of known contributor keys → human label + value formatter.
// Keys NOT in this map fall back to title-case humanisation. Both server-side
// camelCase and any lingering snake_case keys are covered.
type ContribSpec = { label: string; fmt: (v: unknown) => string | null };
const CONTRIBUTORS: Record<string, ContribSpec> = {
  hrvValue:                    { label: 'HRV',              fmt: (v) => num(v, 'ms') },
  sleepDuration:               { label: 'Sleep Duration',   fmt: (v) => sleepMinutes(v) },
  sleepScore:                  { label: 'Sleep Score',      fmt: (v) => num(v) },
  sleepEfficiency:             { label: 'Sleep Efficiency', fmt: (v) => num(v, '%') },
  sleep_efficiency:            { label: 'Sleep Efficiency', fmt: (v) => num(v, '%') },
  rhrValue:                    { label: 'RHR',              fmt: (v) => num(v, 'bpm') },
  hrValue:                     { label: 'HR',               fmt: (v) => num(v, 'bpm') },
  sustainedDeficit:            { label: 'Sustained Deficit', fmt: (v) => boolYesNo(v) },
  sustained_deficit_flag:      { label: 'Sustained Deficit', fmt: (v) => boolYesNo(v) },
  hrvHighDemandCooccurrence7d: { label: 'HRV × High-Demand (7d)', fmt: (v) => cooccurrence(v) },
  hrv_low_high_demand_cooccurrence_7d: { label: 'HRV × High-Demand (7d)', fmt: (v) => cooccurrence(v) },
  protectionGoalsCount:        { label: 'Protected Goals',  fmt: (v) => num(v) },
  clarityLevel:                { label: 'Clarity',          fmt: (v) => num(v, '/5') },
  emotionLevel:                { label: 'Emotion',          fmt: (v) => num(v, '/5') },
  regulationLevel:             { label: 'Regulation',       fmt: (v) => num(v, '/5') },
  pressureLevel:               { label: 'Pressure',         fmt: (v) => num(v, '/5') },
};

const EXPECTED_CONTRIBUTORS: Record<PillTooltipPill['key'], Array<{ key: string; label: string; missing: string }>> = {
  decision_readiness: [
    { key: 'hrvValue', label: 'HRV', missing: 'No HRV data available' },
    { key: 'sleepDuration', label: 'Sleep Duration', missing: 'No sleep duration available' },
    { key: 'sleepScore', label: 'Sleep Score', missing: 'No sleep score available' },
    { key: 'clarityLevel', label: 'Clarity', missing: 'No check-in yet' },
  ],
  physical_reserves: [
    { key: 'rhrValue', label: 'RHR', missing: 'No RHR data available' },
    { key: 'hrValue', label: 'HR', missing: 'No HR data available' },
  ],
  resilience_capacity: [
    { key: 'sleepEfficiency', label: 'Sleep Efficiency', missing: 'No sleep efficiency available' },
    { key: 'emotionLevel', label: 'Emotion', missing: 'No check-in yet' },
    { key: 'regulationLevel', label: 'Regulation', missing: 'No check-in yet' },
    { key: 'pressureLevel', label: 'Pressure', missing: 'No check-in yet' },
  ],
};

// Contributor keys we intentionally suppress (legacy server payloads only).
const SUPPRESS = new Set<string>([
  'calendarLoad',
  'calendarPressure',
  'consecutive_high_load_days',
  'typical_load_for_dow',
  'cognitive_fragmentation_score',
  'short_gap_count',
  'back_to_back_hours',
  'hrvDeviation',
  'rhrDeviation',
  'hrDeviation',
  'sleepDeviation',
  'hrv_3day_trend',  // surfaced inline via qualifiers
  'rhr_3day_trend',  // surfaced inline via qualifiers
]);

/**
 * Per-pill contributor keys the tooltip will render. Any contributor key
 * echoed by the server outside this whitelist for a given pill is ignored
 * so legacy snapshots (e.g. old `sleepDuration` on `physical_reserves`)
 * cannot leak sleep rows into Physical Reserves.
 */
const ALLOWED_CONTRIBUTORS: Record<PillTooltipPill['key'], Set<string>> = {
  decision_readiness: new Set([
    'hrvValue',
    'sleepDuration',
    'sleepScore',
    'clarityLevel',
  ]),
  physical_reserves: new Set(['rhrValue', 'hrValue']),
  resilience_capacity: new Set([
    'sleepEfficiency',
    'sleep_efficiency',
    'emotionLevel',
    'regulationLevel',
    'pressureLevel',
    'sustainedDeficit',
    'sustained_deficit_flag',
    'hrvHighDemandCooccurrence7d',
    'hrv_low_high_demand_cooccurrence_7d',
    'protectionGoalsCount',
  ]),
};

/** Canonical mind-dim identity: qualifier key ↔ contributor key. */
const MIND_DIMS = [
  { dim: 'clarity',    contribKey: 'clarityLevel'    },
  { dim: 'emotion',    contribKey: 'emotionLevel'    },
  { dim: 'regulation', contribKey: 'regulationLevel' },
  { dim: 'pressure',   contribKey: 'pressureLevel'  },
] as const;
const MIND_CONTRIB_TO_DIM: Record<string, string> = Object.fromEntries(
  MIND_DIMS.map((m) => [m.contribKey, m.dim]),
);

function num(v: unknown, suffix = ''): string | null {
  if (typeof v !== 'number' || Number.isNaN(v)) return null;
  const rounded = Number.isInteger(v) ? v : Math.round(v * 10) / 10;
  return `${rounded}${suffix}`;
}
/**
 * HRV × High-Demand co-occurrence is delivered as either a bare count or
 * an object: { cooccurrence_count, cooccurrence_ratio, days_observed }.
 * Render a human label or return null (suppress) when nothing meaningful.
 */
function cooccurrence(v: unknown): string | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v <= 0) return null;
    return `${v} day${v === 1 ? '' : 's'}`;
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const count = typeof o.cooccurrence_count === 'number' ? o.cooccurrence_count : null;
    const days = typeof o.days_observed === 'number' ? o.days_observed : null;
    if (count != null && count > 0) {
      return days != null && days > 0 ? `${count} of ${days} days` : `${count} day${count === 1 ? '' : 's'}`;
    }
    if (days != null && days > 0 && count === 0) return 'None observed';
    return null;
  }
  return null;
}
function sleepMinutes(v: unknown): string | null {
  if (typeof v !== 'number' || Number.isNaN(v)) return null;
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
function boolYesNo(v: unknown): string | null {
  if (typeof v !== 'boolean') return v == null ? null : String(v);
  return v ? 'Yes' : 'No';
}
function titleCase(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length <= 3 && w === w.toLowerCase() ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}
function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/* ── Qualifier formatting (inline, grey italic, in brackets) ─────────── */

// Each qualifier dim returns a per-mind-dim / per-contributor-key map of
// inline strings. The renderer joins the string to whichever row owns it.
// Mind dim qualifiers are keyed by dim name ("clarity", "emotion", …) so
// they can be merged into the raw contributor row when it exists.
function formatQualifiers(
  q: Record<string, unknown> | undefined
): Map<string, string> {
  const out = new Map<string, string>();
  if (!q) return out;

  const hrv = q.hrv as any;
  if (hrv) {
    const parts: string[] = [];
    // Prefer the ms-scale delta3d if present; the % trend3d is a fallback.
    if (typeof hrv.delta3d === 'number' && Math.abs(hrv.delta3d) >= 3) {
      parts.push(`${signed(Math.round(hrv.delta3d))}ms on 3-day avg`);
    } else if (typeof hrv.trend3d === 'number' && Math.abs(hrv.trend3d) >= 3) {
      parts.push(`${signed(Math.round(hrv.trend3d))}% on 3-day avg`);
    }
    if (typeof hrv.vsBaselinePct === 'number' && Math.abs(hrv.vsBaselinePct) >= 5) {
      parts.push(`${signed(hrv.vsBaselinePct)}% vs baseline`);
    }
    if (typeof hrv.streakLowDays === 'number' && hrv.streakLowDays >= 2) {
      parts.push(`${hrv.streakLowDays}-day low streak`);
    }
    if (parts.length) out.set('hrvValue', parts.join(' · '));
  }

  const sleep = q.sleep as any;
  if (sleep) {
    if (typeof sleep.durationDelta7d === 'number' && Math.abs(sleep.durationDelta7d) >= 15) {
      const mins = Math.abs(Math.round(sleep.durationDelta7d));
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      const amt = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
      const sign = sleep.durationDelta7d >= 0 ? '+' : '-';
      out.set('sleepDuration', `${sign}${amt} vs 7-day avg`);
    }
    if (typeof sleep.scoreVsBaseline === 'number' && Math.abs(sleep.scoreVsBaseline) >= 3) {
      out.set('sleepScore', `${signed(sleep.scoreVsBaseline)}pts vs sleep quality baseline`);
    }
  }

  const rhr = q.rhr as any;
  if (rhr) {
    const parts: string[] = [];
    if (typeof rhr.trend3d === 'number' && Math.abs(rhr.trend3d) >= 3) {
      parts.push(`${signed(Math.round(rhr.trend3d))}% on 3-day trend`);
    }
    if (typeof rhr.vsBaselinePct === 'number' && Math.abs(rhr.vsBaselinePct) >= 5) {
      parts.push(`${signed(rhr.vsBaselinePct)}% vs baseline`);
    }
    if (parts.length) out.set('rhrValue', parts.join(' · '));
  }

  const se = q.sleep_efficiency as any;
  if (se) {
    const parts: string[] = [];
    if (typeof se.delta7d === 'number' && Math.abs(se.delta7d) >= 3) {
      parts.push(`${signed(Math.round(se.delta7d))}pts vs 7-day avg`);
    }
    if (typeof se.streakLowDays === 'number' && se.streakLowDays >= 2) {
      parts.push(`${se.streakLowDays} nights below optimal`);
    }
    if (parts.length) {
      const s = parts.join(' · ');
      out.set('sleepEfficiency', s);
      out.set('sleep_efficiency', s);
    }
  }

  // Mind dims are keyed by dim name so the row builder can attach the
  // qualifier to either the raw contributor row (when present) OR a single
  // qualifier-only row — never both.
  for (const dim of ['clarity', 'emotion', 'regulation', 'pressure'] as const) {
    const m = q[dim] as any;
    if (!m) continue;
    const parts: string[] = [];
    if (typeof m.delta3d === 'number' && Math.abs(m.delta3d) >= 0.3) {
      parts.push(`${signed(Number(m.delta3d.toFixed(1)))}pt on 3-day avg`);
    }
    if (typeof m.vsDow === 'number' && Math.abs(m.vsDow) >= 0.3) {
      parts.push(`${signed(Number(m.vsDow.toFixed(1)))}pt vs same weekday`);
    }
    if (typeof m.peakStreak === 'number' && m.peakStreak >= 2) {
      parts.push(`${m.peakStreak}-day peak streak`);
    }
    if (parts.length) out.set(`__mind_${dim}`, parts.join(' · '));
  }

  return out;
}

/**
 * Which mind dims a given pill is allowed to render, in display order.
 * Decision Readiness owns Clarity; Resilience Capacity owns Emotion /
 * Regulation / Pressure. Physical Reserves does not surface mind dims.
 */
function mindDimsForPill(pillKey: PillTooltipPill['key']): readonly string[] {
  if (pillKey === 'decision_readiness') return ['clarity'];
  if (pillKey === 'resilience_capacity') return ['emotion', 'regulation', 'pressure'];
  return [];
}

export default function PillDetailContent({
  pill,
}: {
  pill: PillTooltipPill | null | undefined;
}) {
  if (!pill) {
    return (
      <span className="text-xs text-muted-foreground/55 font-body italic">
        Signal detail unavailable for this pillar
      </span>
    );
  }

  const qualifierMap = formatQualifiers(pill.qualifiers);

  type Row = { key: string; label: string; value?: string; qualifier?: string };
  const rows: Row[] = [];
  const seenRows = new Set<string>();
  const contributorKeysPresent: string[] = [];
  const contributorKeysSuppressed: string[] = [];
  const allowed = ALLOWED_CONTRIBUTORS[pill.key];

  // 1) Real contributors echoed by the server — humanised, suppressed if legacy.
  for (const [k, raw] of Object.entries(pill.contributors ?? {})) {
    if (raw == null) continue;
    contributorKeysPresent.push(k);
    if (SUPPRESS.has(k)) {
      contributorKeysSuppressed.push(k);
      continue;
    }
    // Legacy snapshot guard: e.g. old `physical_reserves` payloads that
    // still ship `sleepDuration`/`sleepScore` must not render sleep rows
    // under Physical Reserves.
    if (allowed && !allowed.has(k)) {
      contributorKeysSuppressed.push(k);
      continue;
    }
    const spec = CONTRIBUTORS[k];
    const label = spec?.label ?? titleCase(k);
    let value: string | undefined;
    if (spec) {
      const formatted = spec.fmt(raw);
      value = formatted == null || isUnsafeObjectText(formatted) ? undefined : formatted;
    } else {
      // Route EVERY non-spec value (including strings) through the shared
      // safe formatter so an upstream `"[object Object]"` cannot leak.
      const safe = formatDisplayValue(raw);
      value = safe && !isUnsafeObjectText(safe) ? safe : undefined;
    }
    // If this contributor is a mind-dim raw value, merge the qualifier
    // keyed by its canonical dim name (e.g. `__mind_clarity`) into the
    // same row. Also mark the dim key as "seen" so the qualifier-only
    // pass below cannot emit a second row.
    const dim = MIND_CONTRIB_TO_DIM[k];
    const qualifier = dim
      ? qualifierMap.get(`__mind_${dim}`)
      : qualifierMap.get(k);
    if (value == null && !qualifier) continue;
    rows.push({ key: k, label, value, qualifier });
    seenRows.add(k);
    if (dim) seenRows.add(`__mind_${dim}`);
  }

  // 2) Qualifier-only mind rows. For each dim owned by this pill: if we
  // did NOT already emit a raw contributor row and a qualifier string
  // exists, render exactly one qualifier-only row. Mark BOTH the dim key
  // and the raw contributor key as seen so the expected-missing pass
  // does not add a "No check-in yet" duplicate.
  for (const dim of mindDimsForPill(pill.key)) {
    const qKey = `__mind_${dim}`;
    if (seenRows.has(qKey)) continue;
    const q = qualifierMap.get(qKey);
    if (!q) continue;
    const contribKey = MIND_DIMS.find((m) => m.dim === dim)!.contribKey;
    rows.push({ key: qKey, label: titleCase(dim), qualifier: q });
    seenRows.add(qKey);
    seenRows.add(contribKey);
  }

  // Row 1/2 above only counts rows backed by REAL contributor evidence.
  const realRowCount = rows.length;
  const nonNeutralTier = pill.tier !== 'neutral';
  // When the pill claims a non-neutral tier (e.g. "Body Steady") but no
  // displayable contributor rows resolved, do NOT paint the expected-missing
  // rows underneath — that reads as "positive label backed by nothing".
  // Render a single neutral explanatory line instead.
  const useNeutralFallback = nonNeutralTier && realRowCount === 0;

  // 3) Expected-but-missing rows. Missing signals should be visible to the
  // user; they reduce confidence instead of silently disappearing.
  if (!useNeutralFallback) {
    for (const expected of EXPECTED_CONTRIBUTORS[pill.key] ?? []) {
      if (seenRows.has(expected.key)) continue;
      rows.push({
        key: `missing_${expected.key}`,
        label: expected.label,
        value: expected.missing,
      });
    }
  }

  // Diagnostics — helps trace tier/contributor disagreements from the browser.
  // No PII; keys only.
  try {
    // eslint-disable-next-line no-console
    console.log('[pill-detail]', {
      key: pill.key,
      tier: pill.tier,
      tierLabel: pill.tierLabel,
      isScoreBearing: pill.isScoreBearing ?? null,
      hiddenReason: pill.hiddenReason ?? null,
      contributorKeysPresent,
      contributorKeysSuppressed,
      displayableRowCount: realRowCount,
      useNeutralFallback,
    });
  } catch {}

  return (
    <div className="flex flex-col gap-3">
      {useNeutralFallback ? (
        <span className="text-xs text-muted-foreground/70 font-body italic">
          {NEUTRAL_FALLBACK_ON_EMPTY[pill.key] ?? 'Detail not available for this reading.'}
        </span>
      ) : rows.length > 0 ? (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li
              key={row.key}
              className="text-[14px] leading-snug text-foreground/85 font-body"
            >
              <span className="text-muted-foreground">{row.label}</span>
              {row.value != null && row.value !== '' && !isUnsafeObjectText(row.value) && (
                <>: <span className="text-foreground/90">{row.value}</span></>
              )}
              {row.qualifier && (
                <span className="ml-1.5 italic text-muted-foreground/70 font-body text-[13px]">
                  ({row.qualifier})
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-xs text-muted-foreground/55 font-body italic">
          Awaiting signals.
        </span>
      )}
    </div>
  );
}
