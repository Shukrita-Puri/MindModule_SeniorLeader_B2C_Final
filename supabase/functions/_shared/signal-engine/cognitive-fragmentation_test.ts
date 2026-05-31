// MRS v2 — golden tests for cognitive_fragmentation_score (§3.5).

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeCognitiveFragmentation } from './cognitive-fragmentation.ts';

const D = (h: number, m: number = 0) =>
  new Date(Date.UTC(2026, 0, 1, h, m, 0)).toISOString();

Deno.test('fragmentation: empty events → all-zero', () => {
  const got = computeCognitiveFragmentation([]);
  assertEquals(got, {
    back_to_back_hours: 0,
    short_gap_count: 0,
    adjacent_gap_count: 0,
    fragmentation_score: 0,
  });
});

Deno.test('fragmentation: spaced day (60-min gaps) → score 0', () => {
  const events = [
    { start_time: D(9), end_time: D(10) },
    { start_time: D(11), end_time: D(12) },
    { start_time: D(13), end_time: D(14) },
  ];
  const got = computeCognitiveFragmentation(events);
  assertEquals(got.short_gap_count, 0);
  assertEquals(got.back_to_back_hours, 0);
  assertEquals(got.fragmentation_score, 0);
});

Deno.test('fragmentation: 3 back-to-back hours (0-min gaps) → chain hours counted', () => {
  const events = [
    { start_time: D(9),  end_time: D(10) },
    { start_time: D(10), end_time: D(11) },
    { start_time: D(11), end_time: D(12) },
  ];
  const got = computeCognitiveFragmentation(events);
  assertEquals(got.short_gap_count, 2);
  assertEquals(got.adjacent_gap_count, 2);
  assertEquals(got.back_to_back_hours, 3);
  // 12 * 3 + 60 * (2/2) = 36 + 60 = 96
  assertEquals(got.fragmentation_score, 96);
});

Deno.test('fragmentation: mixed — one short gap, one long → partial chain', () => {
  const events = [
    { start_time: D(9),  end_time: D(10) },     // chain start
    { start_time: D(10, 5), end_time: D(11) },  // 5-min gap → chain
    { start_time: D(13), end_time: D(14) },     // long gap → chain ends
  ];
  const got = computeCognitiveFragmentation(events);
  assertEquals(got.short_gap_count, 1);
  assertEquals(got.adjacent_gap_count, 2);
  // chain is event0 + event1 → 9:00–11:00 = 2h
  assertEquals(got.back_to_back_hours, 2);
  // 12*2 + 60*(1/2) = 24 + 30 = 54
  assertEquals(got.fragmentation_score, 54);
});

Deno.test('fragmentation: skips bad timestamps without throwing', () => {
  const events = [
    { start_time: 'not-a-date', end_time: D(10) },
    { start_time: D(9), end_time: D(10) },
    { start_time: D(10), end_time: D(9) }, // inverted
    { start_time: D(10), end_time: D(11) },
  ];
  const got = computeCognitiveFragmentation(events as any);
  // Only the two valid events remain → 1 gap, 0-min apart.
  assertEquals(got.adjacent_gap_count, 1);
  assertEquals(got.short_gap_count, 1);
  assertEquals(got.back_to_back_hours, 2);
});

Deno.test('fragmentation: clamps at 100', () => {
  // 8h chain, all sub-15-min gaps → 12*8 + 60*1 = 156 → clamp 100.
  const events = Array.from({ length: 8 }, (_, i) => ({
    start_time: D(9 + i, 0),
    end_time:   D(9 + i, 55),
  }));
  const got = computeCognitiveFragmentation(events);
  assertEquals(got.fragmentation_score, 100);
});