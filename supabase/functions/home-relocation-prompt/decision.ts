/** Relocation prompting only; never changes travel detection or the home anchor. */
const DAY_MS = 86_400_000;
export interface PromptState {
  anchor?: string;
  resetAt?: string;
  deferrals?: number;
  snoozedUntil?: string;
  suppressed?: boolean;
}
export interface LocationSample {
  lat: number;
  lng: number;
  captured_at: string;
  created_at: string;
  accuracy_m: number | null;
}
export function distanceKm(lat: number, lng: number, homeLat: number, homeLng: number): number {
  const rad = (n: number) => n * Math.PI / 180;
  const a = Math.sin(rad(homeLat - lat) / 2) ** 2 +
    Math.cos(rad(lat)) * Math.cos(rad(homeLat)) * Math.sin(rad(homeLng - lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}
export function localDay(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
export function decideRelocation(input: {
  now: number; homeLat: number; homeLng: number; homeSetAt: string;
  timezone: string; state: PromptState; samples: LocationSample[]; travelling: boolean;
}) {
  const anchor = `${input.homeSetAt}|${input.homeLat}|${input.homeLng}`;
  let state: PromptState = input.state.anchor === anchor ? { ...input.state } : { anchor };
  const epoch = Math.max(Date.parse(input.homeSetAt), Date.parse(state.resetAt ?? input.homeSetAt));
  const today = localDay(input.now, input.timezone);
  // One factual day, not one occurrence per ping. Mixed home/away days never
  // count as a full home day; uncertain distance/accuracy does not count.
  const days = new Map<string, { home: boolean; away: boolean; other: boolean }>();
  let latest: { ms: number; distance: number } | null = null;
  for (const sample of input.samples) {
    const ms = Date.parse(sample.captured_at);
    const uploaded = Date.parse(sample.created_at);
    if (!Number.isFinite(ms) || !Number.isFinite(uploaded) || ms <= epoch || ms > input.now ||
      uploaded - ms > 90 * 60_000 || (sample.accuracy_m != null &&
      (!Number.isFinite(sample.accuracy_m) || sample.accuracy_m < 0 || sample.accuracy_m > 1000)) ||
      !Number.isFinite(sample.lat) || !Number.isFinite(sample.lng) || Math.abs(sample.lat) > 90 || Math.abs(sample.lng) > 180) continue;
    const distance = distanceKm(sample.lat, sample.lng, input.homeLat, input.homeLng);
    if (!latest || ms > latest.ms) latest = { ms, distance };
    const day = localDay(ms, input.timezone);
    const status = days.get(day) ?? { home: false, away: false, other: false };
    const uncertainty = (sample.accuracy_m ?? 0) / 1000;
    if (distance + uncertainty <= 25) status.home = true;
    else if (distance - uncertainty > 100) status.away = true;
    else status.other = true;
    days.set(day, status);
  }
  // A completed seven-day home run resets even if a subsequent departure
  // happened before the next app open. Missing days never prove presence.
  let run = 0;
  let lastDay: string | null = null;
  let resetDay: string | null = null;
  for (const [day, status] of [...days.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (day >= today) continue;
    const adjacent = lastDay !== null && Date.parse(day) - Date.parse(lastDay) === DAY_MS;
    run = status.home && !status.away && !status.other ? (adjacent ? run + 1 : 1) : 0;
    if (run >= 7) resetDay = day;
    lastDay = day;
  }
  if (resetDay) {
    state = { anchor, resetAt: new Date(input.now).toISOString() };
    return { eligible: false, reason: 'seven_days_home', awayDays: 0, state };
  }
  let awayDays = 0;
  for (let i = 1; i <= 56; i++) {
    const day = new Date(Date.parse(`${today}T00:00:00Z`) - i * DAY_MS).toISOString().slice(0, 10);
    if (days.get(day)?.away) awayDays++;
  }
  const reason = state.suppressed || (state.deferrals ?? 0) >= 2 ? 'kept_home_or_two_deferrals'
    : Date.parse(state.snoozedUntil ?? '') > input.now ? 'snoozed'
    : input.now - epoch < 56 * DAY_MS ? 'under_eight_weeks'
    : awayDays < 40 ? 'insufficient_confirmed_away_days'
    : input.travelling ? 'current_trip'
    : !latest || input.now - latest.ms > 90 * 60_000 || latest.distance <= 100 ? 'no_fresh_away_location'
    : 'eligible';
  return { eligible: reason === 'eligible', reason, awayDays, state };
}
export function respondToPrompt(state: PromptState, action: 'not_now' | 'keep_home' | 'update', now: number): PromptState {
  if (action === 'keep_home') return { ...state, suppressed: true };
  if (action === 'update') return { ...state, snoozedUntil: new Date(now + 56 * DAY_MS).toISOString() };
  const deferrals = (state.deferrals ?? 0) + 1;
  return { ...state, deferrals, suppressed: deferrals >= 2, snoozedUntil: new Date(now + 56 * DAY_MS).toISOString() };
}