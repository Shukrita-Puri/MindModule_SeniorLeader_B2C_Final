// MRS v4 — scenario modelling harness.
//
// Run: deno run --allow-read supabase/functions/_shared/signal-engine/mrs-v4-modelling.ts
//
// Produces the two tables required before the provisional constants
// (ZERO_DEMAND_CREDIT, MORNING_DEMAND_SPLIT) are locked. Pure functions
// only — nothing here is imported by runtime code.

import { composeBaselineV4, type SubScore } from './mrs-v4-compose.ts';
import { MRS_V4_WEIGHTS, type SubComponentId, type Window } from './mrs-v4-weights.ts';

type Cells = Partial<Record<SubComponentId, number | null>>;

/** Build sub-scores where `null` = unavailable, a number = earned score. */
function build(window: Window, cells: Cells): SubScore[] {
  return MRS_V4_WEIGHTS[window].map((c) => {
    const v = cells[c.id];
    return typeof v === 'number'
      ? { id: c.id, score: v, available: true }
      : { id: c.id, score: 0, available: false };
  });
}

/** Demand readiness score for a raw demand load under a given credit. */
export function demandScoreAt(rawDemand: number | null, credit: number): number | null {
  if (rawDemand == null) return null;
  if (rawDemand === 0) return Math.round(credit * 100);
  return Math.max(0, Math.min(100, Math.round(100 - rawDemand)));
}

function tier(score: number | null): string {
  if (score == null) return 'awaiting';
  if (score >= 78) return 'peak';
  if (score >= 65) return 'strong';
  if (score >= 50) return 'mixed';
  if (score >= 35) return 'managing';
  return 'depleted';
}

function morning(
  phys: { hrv: number | null; sleep: number | null; rhr: number | null },
  demand: { today: number | null; yesterday: number | null },
  credit: number,
): number | null {
  return composeBaselineV4(
    'morning',
    build('morning', {
      hrvMorningDeviation: phys.hrv,
      sleepDeviation: phys.sleep,
      rhrTrend: phys.rhr,
      todayFullDayDemand: demandScoreAt(demand.today, credit),
      yesterdayCarryover: demandScoreAt(demand.yesterday, credit),
    }),
  ).baseline;
}

const CREDITS = [0.4, 0.5, 0.6, 0.75];

function zeroDemandTable(): string {
  const physSets: Array<[string, { hrv: number | null; sleep: number | null; rhr: number | null }]> = [
    ['low physiology (HRV -23%)', { hrv: 20, sleep: null, rhr: 45 }],
    ['moderate physiology', { hrv: 55, sleep: 55, rhr: 55 }],
    ['strong physiology', { hrv: 85, sleep: 80, rhr: 80 }],
  ];
  const demandSets: Array<[string, { today: number | null; yesterday: number | null }]> = [
    ['empty calendar (0/0)', { today: 0, yesterday: 0 }],
    ['normal demand (60/50)', { today: 60, yesterday: 50 }],
  ];
  const rows: string[] = ['physiology | demand | 40% | 50% | 60% | 75%'];
  for (const [pName, phys] of physSets) {
    for (const [dName, dem] of demandSets) {
      const cols = CREDITS.map((c) => {
        const s = morning(phys, dem, c);
        return `${s ?? 'null'} (${tier(s)})`;
      });
      rows.push(`${pName} | ${dName} | ${cols.join(' | ')}`);
    }
  }
  return rows.join('\n');
}

function morningSplitTable(credit: number): string {
  const splits: Array<[number, number]> = [[25, 5], [20, 10], [15, 15], [10, 20]];
  const cases: Array<[string, { today: number | null; yesterday: number | null }]> = [
    ['yesterday high / today low', { today: 15, yesterday: 85 }],
    ['yesterday low / today high', { today: 85, yesterday: 15 }],
    ['both high', { today: 85, yesterday: 85 }],
    ['both zero', { today: 0, yesterday: 0 }],
    ['yesterday unavailable / today available', { today: 60, yesterday: null }],
    ['yesterday available / today unavailable', { today: null, yesterday: 60 }],
  ];
  const phys = { hrv: 55, sleep: 55, rhr: 55 };
  const rows: string[] = ['case | 25/5 | 20/10 | 15/15 | 10/20'];
  for (const [name, dem] of cases) {
    const cols = splits.map(([t, y]) => {
      const subs: SubScore[] = [
        { id: 'hrvMorningDeviation', score: phys.hrv, available: true },
        { id: 'sleepDeviation', score: phys.sleep, available: true },
        { id: 'rhrTrend', score: phys.rhr, available: true },
        { id: 'todayFullDayDemand', score: demandScoreAt(dem.today, credit) ?? 0, available: dem.today != null },
        { id: 'yesterdayCarryover', score: demandScoreAt(dem.yesterday, credit) ?? 0, available: dem.yesterday != null },
        { id: 'patternEngineComposite', score: 0, available: false },
      ];
      // Temporarily swap the morning demand weights for this split.
      const table = MRS_V4_WEIGHTS.morning;
      const todayCell = table.find((c) => c.id === 'todayFullDayDemand')!;
      const ydayCell = table.find((c) => c.id === 'yesterdayCarryover')!;
      const prev = [todayCell.weight, ydayCell.weight];
      todayCell.weight = t;
      ydayCell.weight = y;
      const s = composeBaselineV4('morning', subs).baseline;
      todayCell.weight = prev[0];
      ydayCell.weight = prev[1];
      return `${s ?? 'null'}`;
    });
    rows.push(`${name} | ${cols.join(' | ')}`);
  }
  return rows.join('\n');
}

if (import.meta.main) {
  console.log('=== Zero-demand recovery credit ===');
  console.log(zeroDemandTable());
  console.log('\n=== Morning demand split (credit = 50%) ===');
  console.log(morningSplitTable(0.5));
  console.log('\n=== Morning demand split (credit = 60%) ===');
  console.log(morningSplitTable(0.6));
}