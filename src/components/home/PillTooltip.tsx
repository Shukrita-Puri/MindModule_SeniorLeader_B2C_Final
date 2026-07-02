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
 * separate backend-style row. The amber tier-reason sentence is intentionally
 * NOT rendered here; it collides with the pill header in the glass box.
 */

type PillTier = 'green' | 'amber' | 'red' | 'neutral';

import { formatDisplayValue, isUnsafeObjectText } from '@/utils/safeDisplayValue';

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
    { key: 'sleepDuration', label: 'Sleep Duration', missing: 'No sleep duration available' },
    { key: 'sleepScore', label: 'Sleep Score', missing: 'No sleep score available' },
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

// Each qualifier dim returns a per-contributor-key map of inline strings.
// The contributor row picks up the string by its own key.
function formatQualifiers(
  q: Record<string, unknown> | undefined
): Map<string, string> {
  const out = new Map<string, string>();
  if (!q) return out;

  const hrv = q.hrv as any;
  if (hrv) {
    const parts: string[] = [];
    if (typeof hrv.trend3d === 'number') {
      const dir = hrv.trend3d < 0 ? 'Declining' : 'Improving';
      parts.push(`${dir} 3-day trend by ${signed(hrv.trend3d)}%`);
    } else if (typeof hrv.delta3d === 'number') {
      parts.push(`Δ3d ${signed(hrv.delta3d)}`);
    }
    if (typeof hrv.vsBaselinePct === 'number') {
      parts.push(`${signed(hrv.vsBaselinePct)}% vs baseline`);
    }
    if (typeof hrv.streakLowDays === 'number' && hrv.streakLowDays >= 2) {
      parts.push(`${hrv.streakLowDays}-day low streak`);
    }
    if (parts.length) out.set('hrvValue', parts.join(' · '));
  }

  const sleep = q.sleep as any;
  if (sleep) {
    if (typeof sleep.durationDelta7d === 'number') {
      out.set('sleepDuration', `${signed(Math.round(sleep.durationDelta7d))}min vs 7-day avg`);
    }
    if (typeof sleep.scoreVsBaseline === 'number') {
      out.set('sleepScore', `${signed(sleep.scoreVsBaseline)} vs baseline`);
    }
  }

  const rhr = q.rhr as any;
  if (rhr) {
    const parts: string[] = [];
    if (typeof rhr.trend3d === 'number') {
      const dir = rhr.trend3d > 0 ? 'Rising' : 'Falling';
      parts.push(`${dir} 3-day trend by ${signed(rhr.trend3d)}%`);
    }
    if (typeof rhr.vsBaselinePct === 'number') {
      parts.push(`${signed(rhr.vsBaselinePct)}% vs baseline`);
    }
    if (parts.length) out.set('rhrValue', parts.join(' · '));
  }

  const se = q.sleep_efficiency as any;
  if (se) {
    const parts: string[] = [];
    if (typeof se.delta7d === 'number') parts.push(`${signed(Math.round(se.delta7d))}pts vs 7-day avg`);
    if (typeof se.streakLowDays === 'number' && se.streakLowDays >= 2) parts.push(`${se.streakLowDays}-day low streak`);
    if (parts.length) {
      const s = parts.join(' · ');
      out.set('sleepEfficiency', s);
      out.set('sleep_efficiency', s);
    }
  }

  // Mind dims become their own contributor rows so Resilience Capacity can
  // surface emotion/regulation/pressure with inline pattern qualifiers.
  for (const dim of ['clarity', 'emotion', 'regulation', 'pressure'] as const) {
    const m = q[dim] as any;
    if (!m) continue;
    const parts: string[] = [];
    if (typeof m.delta3d === 'number' && m.delta3d !== 0) parts.push(`Δ3d ${signed(m.delta3d)}`);
    if (typeof m.vsDow === 'number' && m.vsDow !== 0) parts.push(`${signed(m.vsDow)} vs same weekday`);
    if (typeof m.peakStreak === 'number' && m.peakStreak >= 2) parts.push(`${m.peakStreak}-day peak streak`);
    if (parts.length) out.set(`__mind_${dim}`, parts.join(' · '));
  }

  return out;
}

// Synthesise pseudo-contributor rows from Mind qualifiers so emotion /
// regulation / pressure appear under Resilience Capacity without needing
// the server to echo a redundant raw value.
function mindRowsFromQualifiers(
  q: Record<string, unknown> | undefined,
  pillKey: PillTooltipPill['key']
): Array<{ key: string; label: string; value?: string }> {
  if (!q) return [];
  const dims =
    pillKey === 'resilience_capacity'
      ? (['emotion', 'regulation', 'pressure'] as const)
      : pillKey === 'decision_readiness'
        ? (['clarity'] as const)
        : ([] as const);
  const rows: Array<{ key: string; label: string; value?: string }> = [];
  for (const dim of dims) {
    const m = (q as any)[dim];
    if (!m) continue;
    rows.push({
      key: `__mind_${dim}`,
      label: titleCase(dim),
    });
  }
  return rows;
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

  // 1) Real contributors echoed by the server — humanised, suppressed if legacy.
  for (const [k, raw] of Object.entries(pill.contributors ?? {})) {
    if (raw == null) continue;
    if (SUPPRESS.has(k)) continue;
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
    // Drop the entire row if we have no readable value AND no qualifier to show.
    const qualifier = qualifierMap.get(k);
    if (value == null && !qualifier) continue;
    rows.push({ key: k, label, value, qualifier });
    seenRows.add(k);
  }

  // 2) Synthesised mind rows (Clarity for DR; Emotion/Regulation/Pressure for RC).
  for (const mr of mindRowsFromQualifiers(pill.qualifiers, pill.key)) {
    rows.push({ ...mr, qualifier: qualifierMap.get(mr.key) });
    seenRows.add(mr.key);
  }

  // 3) Expected-but-missing rows. Missing signals should be visible to the
  // user; they reduce confidence instead of silently disappearing.
  for (const expected of EXPECTED_CONTRIBUTORS[pill.key] ?? []) {
    if (seenRows.has(expected.key)) continue;
    rows.push({
      key: `missing_${expected.key}`,
      label: expected.label,
      value: expected.missing,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2 pr-7">
        <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-body">
          {pill.label}
        </span>
        {pill.tierLabel && (
          <span className="text-[11px] uppercase tracking-[0.08em] text-foreground/70 font-body">
            {pill.tierLabel}
          </span>
        )}
      </div>
      {rows.length > 0 ? (
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
