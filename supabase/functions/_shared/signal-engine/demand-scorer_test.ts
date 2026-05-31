// MRS v2 — golden tests for demand-scorer.
// Pins the load / pressure / high-stakes bands and the 0–100 composite to
// known inputs. Any drift here is a tuning task, not a quiet override.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeCalendarDemand, demandToStateScore } from './demand-scorer.ts';
import type { ClassifiedEventLite } from './types.ts';

// Use a date far enough in the future that `start.getTime() >= Date.now()`
// holds for every test run (so pressure isn't half-weighted as "past").
const DAY = '2099-06-15';

function ev(
  startHour: number,
  durMin: number,
  opts: Partial<ClassifiedEventLite> = {},
): ClassifiedEventLite {
  const start = new Date(`${DAY}T${String(startHour).padStart(2, '0')}:00:00Z`);
  const end = new Date(start.getTime() + durMin * 60_000);
  return {
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    is_organizer: false,
    attendees_count: 0,
    is_recurring: false,
    title: 'Untitled',
    event_metadata: null,
    ...opts,
  };
}

Deno.test('demand-scorer: empty calendar → all-zero', () => {
  const out = computeCalendarDemand([]);
  assertEquals(out, { load: 'low', pressure: 'low', hasHighStakes: false, demandScore: 0 });
});

Deno.test('demand-scorer: 4+ events → load=high', () => {
  const events = [ev(9, 30), ev(10, 30), ev(11, 30), ev(13, 30)];
  const out = computeCalendarDemand(events);
  assertEquals(out.load, 'high');
});

Deno.test('demand-scorer: 3 events spaced wide → load=medium', () => {
  // 60m gaps between meetings → avgGap >= 20 → medium not high.
  const events = [ev(9, 30), ev(11, 30), ev(13, 30)];
  const out = computeCalendarDemand(events);
  assertEquals(out.load, 'medium');
});

Deno.test('demand-scorer: 3 events back-to-back → load=high (tight-gap upgrade)', () => {
  const events = [ev(9, 30), ev(10, 30), ev(11, 30)];
  const out = computeCalendarDemand(events);
  assertEquals(out.load, 'high');
});

Deno.test('demand-scorer: high-stakes detection (organizer + attendees>2 + non-recurring)', () => {
  const events = [ev(9, 30, { is_organizer: true, attendees_count: 5 })];
  const out = computeCalendarDemand(events);
  assertEquals(out.hasHighStakes, true);
});

Deno.test('demand-scorer: recurring meeting never high-stakes', () => {
  const events = [ev(9, 30, { is_organizer: true, attendees_count: 10, is_recurring: true })];
  const out = computeCalendarDemand(events);
  assertEquals(out.hasHighStakes, false);
});

Deno.test('demand-scorer: composite — empty day', () => {
  assertEquals(computeCalendarDemand([]).demandScore, 0);
});

Deno.test('demand-scorer: composite — high-load + high-pressure + stakes = 105 → clamped 100', () => {
  // 4 organizer-led non-recurring back-to-back meetings with large attendee counts.
  const events = [
    ev(9, 60, { is_organizer: true, attendees_count: 8 }),
    ev(10, 60, { is_organizer: true, attendees_count: 8 }),
    ev(11, 60, { is_organizer: true, attendees_count: 8 }),
    ev(14, 60, { is_organizer: true, attendees_count: 8 }),
  ];
  const out = computeCalendarDemand(events);
  assertEquals(out.load, 'high');
  assertEquals(out.pressure, 'high');
  assertEquals(out.hasHighStakes, true);
  assertEquals(out.demandScore, 100);
});

Deno.test('demand-scorer: composite is bounded [0,100]', () => {
  for (let n = 0; n <= 8; n++) {
    const evs = Array.from({ length: n }, (_, i) =>
      ev(9 + i, 30, { is_organizer: true, attendees_count: 6 }),
    );
    const s = computeCalendarDemand(evs).demandScore;
    if (s < 0 || s > 100) throw new Error(`out of band: ${s}`);
  }
});

Deno.test('demandToStateScore: bands map 80 / 50 / 20', () => {
  assertEquals(demandToStateScore(90), 80);
  assertEquals(demandToStateScore(71), 80);
  assertEquals(demandToStateScore(70), 50);
  assertEquals(demandToStateScore(40), 50);
  assertEquals(demandToStateScore(39), 20);
  assertEquals(demandToStateScore(0), 20);
});