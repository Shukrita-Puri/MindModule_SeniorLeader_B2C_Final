import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { decideRelocation, respondToPrompt, type LocationSample } from './decision.ts';
const DAY = 86_400_000;
const now = Date.parse('2026-10-21T12:00:00Z');
const homeSetAt = '2026-01-01T12:00:00Z';
const anchor = `${homeSetAt}|51.5|-0.1`;
const sample = (days: number, home = false): LocationSample => ({
  lat: home ? 51.5 : 55.95, lng: home ? -0.1 : -3.19,
  captured_at: new Date(now - days * DAY).toISOString(),
  created_at: new Date(now - days * DAY).toISOString(), accuracy_m: 100,
});
const samples = Array.from({ length: 56 }, (_, i) => sample(i + 1));
const base = { now, homeLat: 51.5, homeLng: -0.1, homeSetAt, timezone: 'Europe/London',
  state: { anchor }, samples: [...samples, sample(0)], travelling: false };

Deno.test('requires at least 40 of the last 56 confirmed away days', () => {
  assertEquals(decideRelocation({ ...base, samples: [...samples.slice(0, 39), sample(0)] }).eligible, false);
  assertEquals(decideRelocation({ ...base, samples: [...samples.slice(0, 40), sample(0)] }).eligible, true);
});
Deno.test('waits eight weeks even with 40 away readings', () => {
  assertEquals(decideRelocation({ ...base, homeSetAt: new Date(now - 55 * DAY).toISOString() }).eligible, false);
});
Deno.test('same-country location beyond 100km qualifies without timezone divergence', () => {
  assertEquals(decideRelocation(base).eligible, true);
});
Deno.test('100km boundary and nearer locations do not count as away', () => {
  const near = base.samples.map(s => ({ ...s, lat: 51.51, lng: -0.1 }));
  assertEquals(decideRelocation({ ...base, samples: near }).awayDays, 0);
});
Deno.test('six-day home visit does not reset the away count', () => {
  const briefHome = [...samples.filter(s => Date.parse(s.captured_at) < now - 6 * DAY),
    ...Array.from({ length: 6 }, (_, i) => sample(i + 1, true)), sample(0)];
  const result = decideRelocation({ ...base, samples: briefHome });
  assertEquals(result.awayDays, 50);
  assertEquals(result.eligible, true);
});
Deno.test('seven consecutive confirmed home days clear and restart the evidence clock', () => {
  const result = decideRelocation({ ...base, samples: [...samples.filter(s => Date.parse(s.captured_at) < now - 7 * DAY),
    ...Array.from({ length: 7 }, (_, i) => sample(i + 1, true)), sample(0)] });
  assertEquals(result.reason, 'seven_days_home');
  assertEquals(result.eligible, false);
  assertEquals(result.state.resetAt, new Date(now).toISOString());
});
Deno.test('missing home days do not prove seven consecutive days at home', () => {
  assertEquals(decideRelocation({ ...base, samples: [...samples, sample(1, true), sample(7, true), sample(0)] }).eligible, true);
});
Deno.test('current trips suppress a qualifying prompt', () => {
  assertEquals(decideRelocation({ ...base, travelling: true }).reason, 'current_trip');
});
Deno.test('stale current location and stale uploaded samples cannot qualify', () => {
  assertEquals(decideRelocation({ ...base, samples }).reason, 'no_fresh_away_location');
  assertEquals(decideRelocation({ ...base, samples: base.samples.map(s => ({ ...s,
    created_at: new Date(Date.parse(s.captured_at) + 2 * 3_600_000).toISOString() })) }).awayDays, 0);
});
Deno.test('unknown days and duplicate pings never inflate the day count', () => {
  assertEquals(decideRelocation({ ...base, samples: Array.from({ length: 100 }, () => sample(1)) }).awayDays, 1);
});
Deno.test('Not now silences for exactly eight weeks and two deferrals stop asking', () => {
  const first = respondToPrompt({ anchor }, 'not_now', now);
  assertEquals(first.snoozedUntil, new Date(now + 56 * DAY).toISOString());
  assertEquals(decideRelocation({ ...base, state: first }).reason, 'snoozed');
  const second = respondToPrompt(first, 'not_now', now + 56 * DAY);
  assertEquals(second.deferrals, 2);
  assertEquals(second.suppressed, true);
});
Deno.test('Keep Home persists until the saved home anchor changes', () => {
  const kept = respondToPrompt({ anchor }, 'keep_home', now);
  assertEquals(decideRelocation({ ...base, state: kept }).eligible, false);
  const changed = decideRelocation({ ...base, state: kept, homeSetAt: '2026-01-02T12:00:00Z' });
  assertEquals(changed.state.suppressed, undefined);
  assertEquals(changed.eligible, true);
});
Deno.test('updating does not count as a Not now deferral', () => {
  assertEquals(respondToPrompt({ anchor }, 'update', now).deferrals, undefined);
});
Deno.test('no location evidence means no prompt', () => {
  assertEquals(decideRelocation({ ...base, samples: [] }).eligible, false);
});