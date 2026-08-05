import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { deriveEveningPhysioSource } from './evening-physio-source.ts';

Deno.test('evening physio: no samples -> unavailable', () => {
  assertEquals(deriveEveningPhysioSource(null, 60), {
    eveningHrDeviationPct: null,
    bodyLoadElevated: null,
    sampleCount: 0,
  });
});

Deno.test('evening physio: only daytime samples -> unavailable', () => {
  const out = deriveEveningPhysioSource(
    [{ t: '2026-08-05T10:00:00Z', v: 70 }, { t: '2026-08-05T14:00:00Z', v: 72 }],
    60,
    0,
  );
  assertEquals(out.sampleCount, 0);
  assertEquals(out.eveningHrDeviationPct, null);
});

Deno.test('evening physio: evening window samples produce deviation', () => {
  const out = deriveEveningPhysioSource(
    [
      { t: '2026-08-05T12:00:00Z', v: 60 },
      { t: '2026-08-05T19:00:00Z', v: 77 },
      { t: '2026-08-05T21:00:00Z', v: 79 },
    ],
    60,
    0,
  );
  assertEquals(out.sampleCount, 2);
  assertEquals(out.eveningHrDeviationPct, 30);
  assertEquals(out.bodyLoadElevated, true);
});

Deno.test('evening physio: local offset shifts the window', () => {
  // 17:30Z is 18:30 local at +60.
  const out = deriveEveningPhysioSource([{ t: '2026-08-05T17:30:00Z', v: 63 }], 60, 60);
  assertEquals(out.sampleCount, 1);
  assertEquals(out.bodyLoadElevated, false);
  assertEquals(out.eveningHrDeviationPct, 5);
});

Deno.test('evening physio: post-midnight samples count as evening', () => {
  const out = deriveEveningPhysioSource([{ t: '2026-08-06T02:00:00Z', v: 66 }], 60, 0);
  assertEquals(out.sampleCount, 1);
});

Deno.test('evening physio: no baseline -> no deviation', () => {
  const out = deriveEveningPhysioSource([{ t: '2026-08-05T20:00:00Z', v: 70 }], null, 0);
  assertEquals(out.sampleCount, 1);
  assertEquals(out.eveningHrDeviationPct, null);
  assertEquals(out.bodyLoadElevated, null);
});
