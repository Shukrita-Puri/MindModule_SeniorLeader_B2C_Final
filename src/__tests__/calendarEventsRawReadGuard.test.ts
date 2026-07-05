/**
 * Repo-level guard: raw `.from('calendar_events')` reads bypass
 * mergeCalendarEvents() and return cross-provider duplicates. Only the files
 * listed below may query the table directly.
 *
 * This test walks the whole repo (including supabase/functions/**) because
 * the ESLint rule in eslint.config.js only covers src/. Between the two,
 * every raw read anywhere in the codebase must be either
 *   (a) inside an approved sync/merge layer, or
 *   (b) explicitly grandfathered here with a plan.md follow-up.
 *
 * When you legitimately need a new raw read, add the file to APPROVED_WRITERS
 * (if it's a sync insert path) or to GRANDFATHERED_READERS with a comment
 * pointing at the plan.md task for wiring it through mergeCalendarEvents().
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

// Approved: shared merge helpers + sync insert paths + list endpoints that
// already wrap results in mergeCalendarEvents() themselves.
const APPROVED_WRITERS = new Set<string>([
  'supabase/functions/sync-calendar/index.ts',
  'supabase/functions/sync-apple-calendar/index.ts',
  'supabase/functions/calendar-auth/index.ts',
  'supabase/functions/list-replacement-calendar-events/index.ts',
  'supabase/functions/list-week-ahead-priorities/index.ts',
]);

// Grandfathered: raw reads tracked in .lovable/plan.md (calendar dedupe
// enforcement) for wiring through mergeCalendarEvents(). Do not add new
// entries here without a matching plan.md task.
const GRANDFATHERED_READERS = new Set<string>([
  'supabase/functions/build-executive-home-cards/index.ts',
  'supabase/functions/cause-effect-engine/index.ts',
  'supabase/functions/self-mastery-coach/index.ts',
  'supabase/functions/record-event-priority-signal/index.ts',
  'supabase/functions/performance-rhythm-insights/index.ts',
  'supabase/functions/generate-coach-summary/index.ts',
  'src/utils/energyStateEngine.ts',
  'src/utils/coachContextBuilder.ts',
  'src/hooks/useCalendarSync.ts',
  'src/components/insights/PerformanceRhythmCard.tsx',
  'src/components/insights/CalendarStateCorrelations.tsx',
  'src/components/home/PostEventReflection.tsx',
]);

const ALLOWED = new Set<string>([...APPROVED_WRITERS, ...GRANDFATHERED_READERS]);

const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '.next', 'ios', 'remotion',
  'legacy', 'coverage', '.lovable',
]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (IGNORE_DIRS.has(name) || name.startsWith('.')) continue;
    const full = join(dir, name);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("calendar_events raw-read guard", () => {
  const root = process.cwd();
  const files = walk(root);
  const rx = /\.from\((['"])calendar_events\1\)/;

  it("only approved sync / merge layers may .from('calendar_events')", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(root, file).replace(/\\/g, '/');
      if (rel.endsWith('src/__tests__/calendarEventsRawReadGuard.test.ts')) continue;
      const content = readFileSync(file, 'utf8');
      if (!rx.test(content)) continue;
      if (!ALLOWED.has(rel)) offenders.push(rel);
    }
    expect(
      offenders,
      `Unauthorized raw calendar_events reads. Wire through mergeCalendarEvents() ` +
        `or add the file to APPROVED_WRITERS / GRANDFATHERED_READERS with a plan.md follow-up.`,
    ).toEqual([]);
  });

  it("every grandfathered reader still contains a raw read (prune stale entries)", () => {
    const stale: string[] = [];
    for (const rel of GRANDFATHERED_READERS) {
      const full = join(root, rel);
      let content = '';
      try { content = readFileSync(full, 'utf8'); } catch { stale.push(rel); continue; }
      if (!rx.test(content)) stale.push(rel);
    }
    expect(
      stale,
      `These files no longer read calendar_events directly. Remove them from ` +
        `GRANDFATHERED_READERS so the guard tightens.`,
    ).toEqual([]);
  });
});