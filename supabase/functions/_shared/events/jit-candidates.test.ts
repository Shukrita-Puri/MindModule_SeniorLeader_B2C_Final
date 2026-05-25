import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { rankJitCandidates } from './jit-candidates.ts';

const NOW = Date.parse('2026-05-25T09:00:00.000Z');
const inHours = (h: number) => new Date(NOW + h * 3600_000).toISOString();

Deno.test('emits pre + post for a board meeting at T+2h', () => {
  const ranked = rankJitCandidates(
    [{ event: { id: 'e1', title: 'Q2 Board meeting', start_time: inHours(2), end_time: inHours(4) }, stakesLevel: 'board' }],
    NOW,
  );
  const phases = ranked.map(r => r.phase).sort();
  assertEquals(phases, ['post', 'pre']);
  assertEquals(ranked.every(r => r.categoryId === 'A'), true);
  // pre should outrank post when both upcoming because it fires sooner & high severity
  assertEquals(ranked[0].phase, 'pre');
});

Deno.test('keynote (category F) emits pre + post', () => {
  const ranked = rankJitCandidates(
    [{ event: { id: 'f1', title: 'Industry keynote', start_time: inHours(6), end_time: inHours(7) }, stakesLevel: 'external' }],
    NOW,
  );
  const fPhases = ranked.filter(r => r.categoryId === 'F').map(r => r.phase).sort();
  assertEquals(fPhases, ['post', 'pre']);
});

Deno.test('long-haul flight (category G) emits a single during candidate', () => {
  const ranked = rankJitCandidates(
    [{ event: { id: 'g1', title: 'Long-haul flight to NYC', start_time: inHours(6), end_time: inHours(14) }, stakesLevel: 'medium' }],
    NOW,
  );
  const g = ranked.filter(r => r.categoryId === 'G');
  assertEquals(g.length, 1);
  assertEquals(g[0].phase, 'during');
});

Deno.test('deep work emits a single pre candidate (category E)', () => {
  const ranked = rankJitCandidates(
    [{ event: { id: 'e2', title: 'Deep work block — strategy', start_time: inHours(1), end_time: inHours(4) }, stakesLevel: 'low' }],
    NOW,
  );
  const eOnly = ranked.filter(r => r.categoryId === 'E');
  assertEquals(eOnly.length, 1);
  assertEquals(eOnly[0].phase, 'pre');
});

Deno.test('board (A) outranks deep work (E) when both upcoming', () => {
  const ranked = rankJitCandidates(
    [
      { event: { id: 'a', title: 'Board meeting',  start_time: inHours(2), end_time: inHours(4) }, stakesLevel: 'board' },
      { event: { id: 'e', title: 'Deep work block', start_time: inHours(2), end_time: inHours(4) }, stakesLevel: 'low' },
    ],
    NOW,
  );
  assertEquals(ranked[0].categoryId, 'A');
});

Deno.test('candidate is eligible once nowMs sits inside its window', () => {
  // Board meeting starts in 30min — pre window is T-60..T-15 → eligible NOW.
  const ranked = rankJitCandidates(
    [{ event: { id: 'x', title: 'Board meeting', start_time: inHours(0.5), end_time: inHours(2) }, stakesLevel: 'board' }],
    NOW,
  );
  const pre = ranked.find(r => r.phase === 'pre');
  assert(pre, 'expected pre candidate');
  assertEquals(pre!.eligible, true);
});

Deno.test('skipPenalty reduces score 1-for-1', () => {
  const a = rankJitCandidates([{ event: { id: '1', title: 'Board meeting', start_time: inHours(2), end_time: inHours(4) }, stakesLevel: 'board' }], NOW);
  const b = rankJitCandidates([{ event: { id: '1', title: 'Board meeting', start_time: inHours(2), end_time: inHours(4) }, stakesLevel: 'board', skipPenalty: 25 }], NOW);
  const aPre = a.find(r => r.phase === 'pre')!.score;
  const bPre = b.find(r => r.phase === 'pre')!.score;
  assertEquals(Math.round(aPre - bPre), 25);
});