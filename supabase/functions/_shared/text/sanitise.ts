/**
 * Brief / Plan text sanitisation + relative time helpers.
 *
 * The LLM occasionally emits stray `*event*` markdown or runs of `**` that
 * surface in the UI as raw asterisks. We strip them defensively at the
 * server boundary instead of enabling a markdown renderer (smaller attack
 * surface, predictable plain-text output).
 *
 * `relativeEventPhrase` resolves a calendar event start into a perception-
 * aware phrase ("tomorrow morning", "later today", etc.) so server copy
 * never reads "Board Meeting still ahead" at 00:12 when the meeting is in
 * fact 9 hours away on the next calendar day.
 */

/** Remove markdown emphasis tokens + collapse runs of whitespace. */
export function stripBriefMarkdown(input: string | null | undefined): string {
  if (!input) return '';
  let s = String(input);
  // Strip ** … ** and __ … __ emphasis wrappers (keep inner text).
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  // Strip single * / _ emphasis wrappers (keep inner text).
  s = s.replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s.,;:!?)]|$)/g, '$1$2');
  s = s.replace(/(^|[\s(])_(?!\s)([^_]+?)_(?=[\s.,;:!?)]|$)/g, '$1$2');
  // Strip stray leading/trailing asterisks adjacent to whitespace.
  s = s.replace(/(^|\s)\*+(\s)/g, '$1$2');
  s = s.replace(/(\s)\*+(\s|$)/g, '$1$2');
  // Strip stray underscores around whitespace.
  s = s.replace(/(^|\s)_+(\s)/g, '$1$2');
  s = s.replace(/(\s)_+(\s|$)/g, '$1$2');
  // Drop any remaining bare asterisks/underscores (e.g. "*Board Meeting *").
  s = s.replace(/\*+/g, '');
  // Collapse double spaces created by removals.
  s = s.replace(/[ \t]{2,}/g, ' ');
  s = s.replace(/\s+([.,;:!?])/g, '$1');
  return s.trim();
}

/**
 * Local-time bucket of the *viewer* (mirrors getTimeLabel on the client):
 * morning 05–11, afternoon 12–17, evening 18–23, early-hours 00–04.
 */
export type LocalTimeBucket = 'early-hours' | 'morning' | 'afternoon' | 'evening';

export function bucketForLocalHour(h: number): LocalTimeBucket {
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 24) return 'evening';
  return 'early-hours';
}

export interface RelativePhraseInput {
  /** Event start in ms (epoch). */
  startMs: number;
  /** "Now" in ms — defaults to Date.now(). */
  nowMs?: number;
  /** Viewer timezone offset in MINUTES (Date#getTimezoneOffset convention). */
  timezoneOffsetMinutes?: number;
}

/**
 * Returns a perception-aware relative phrase for an event time.
 * Examples (viewer at 00:12 local): a 09:00 event same calendar day →
 * "in the morning (≈9h away)". A 14:30 event tomorrow → "tomorrow afternoon".
 */
export function relativeEventPhrase(input: RelativePhraseInput): string {
  const nowMs = input.nowMs ?? Date.now();
  const tzOffsetMin = input.timezoneOffsetMinutes ?? 0;
  const localNow = new Date(nowMs - tzOffsetMin * 60_000);
  const localStart = new Date(input.startMs - tzOffsetMin * 60_000);
  const minutesUntil = Math.round((input.startMs - nowMs) / 60_000);
  const hoursUntil = Math.round(minutesUntil / 60);

  if (minutesUntil < -60) return 'earlier today';
  if (minutesUntil < 5) return 'now';

  const sameDay = localNow.toISOString().slice(0, 10) === localStart.toISOString().slice(0, 10);
  const nowH = localNow.getUTCHours();
  const nowBucket = bucketForLocalHour(nowH);
  const startH = localStart.getUTCHours();
  const startBucket = bucketForLocalHour(startH);

  const bucketWord = (b: LocalTimeBucket): string =>
    b === 'morning' ? 'morning' : b === 'afternoon' ? 'afternoon' : b === 'evening' ? 'evening' : 'early hours';

  // Viewer is in early-hours tail and the event is later the SAME calendar day.
  if (nowBucket === 'early-hours' && sameDay) {
    return `in the ${bucketWord(startBucket)} (≈${Math.max(1, hoursUntil)}h away)`;
  }

  if (sameDay) {
    if (minutesUntil < 90) return 'shortly';
    if (startBucket === nowBucket) return 'later this ' + bucketWord(startBucket);
    return 'later today';
  }

  // Next calendar day or further.
  const dayDiff = Math.floor((localStart.getTime() - new Date(localNow.toISOString().slice(0, 10) + 'T00:00:00Z').getTime()) / 86_400_000);
  if (dayDiff === 1) return `tomorrow ${bucketWord(startBucket)}`;
  if (dayDiff > 1 && dayDiff <= 6) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[localStart.getUTCDay()]} ${bucketWord(startBucket)}`;
  }
  return `in ${dayDiff} days`;
}