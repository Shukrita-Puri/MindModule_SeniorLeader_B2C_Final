// OWNERSHIP: engineering. The canonical title→event classifier plus stakes
// scoring, lead-event selection, dedupe and day-kind detection. Reads from
// ./event-subtypes.ts. Does NOT define taxonomy.

import {
  EVENT_TYPES,
  EVENT_TYPE_TO_SCENARIO_ID,
  PILLAR_META,
  demandSum,
  type EventType,
  type Pillar,
} from "./event-subtypes.ts";

// ── Noise filter ─────────────────────────────────────────────────────

export const NOISE_KEYWORDS: string[] = [
  'station','bus','taxi','uber','cab','car service','platform',
  'delivery','pick up','dry cleaning','groceries','pharmacy','haircut',
  'mot','oil change','dentist','optician',
  'reminder','auto-pay','subscription','booking confirmation','ticket','reservation',
  'placeholder','tentative','hold','blocked','do not book','dnb','no meetings','buffer',
  'lunch','break','commute',
];

export const NOISE_PATTERN = /\[\d{6,}\]/;

export const PERSONAL_BLOCK_PATTERN = /\b(day\s*block|focus\s*time|block\s*time|prep\s*block|prep\b|hold|blocked|do\s*not\s*book|dnb|no\s*meetings|lunch|break|commute|travel\s*time|personal|buffer)\b/i;

export function isNoiseTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  if (NOISE_PATTERN.test(title)) return true;
  if (PERSONAL_BLOCK_PATTERN.test(title)) return true;
  const lower = title.toLowerCase();
  return NOISE_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Classification ──────────────────────────────────────────────────

export function classifyEvent(
  title: string | null | undefined,
  _attendees?: number | null,
  _durationMin?: number | null,
  _isRecurring?: boolean | null,
): EventType | null {
  if (!title) return null;
  const lower = title.toLowerCase();
  for (const et of EVENT_TYPES) {
    if (et.keywords.length === 0) continue;
    if (et.keywords.some((kw) => lower.includes(kw))) return et;
  }
  return null;
}

export function classifyEventLabel(title: string | null | undefined): string | null {
  return classifyEvent(title)?.label ?? null;
}

export function classifyEventBucket(title: string | null | undefined): string | null {
  return classifyEvent(title)?.bucket ?? null;
}

export function scenarioIdFor(title: string | null | undefined): string | null {
  const et = classifyEvent(title);
  if (!et) return null;
  return EVENT_TYPE_TO_SCENARIO_ID[et.id] ?? null;
}

// Legacy keyword table consumed by older callers (cause-effect / nudges).
export const EVENT_TYPE_KEYWORDS: Array<{ label: string; words: string[] }> = [
  { label: 'School & family',         words: ['school','parents evening','open evening','parents','governor'] },
  { label: 'Board / governance',      words: ['board','governance'] },
  { label: 'Investor calls',          words: ['investor','vc ',' vc','fundraise','raise','pitch deck'] },
  { label: 'Reviews',                 words: ['review','qbr','quarterly'] },
  { label: '1:1s',                    words: ['1:1','1-1','one on one','1on1'] },
  { label: 'All-hands',               words: ['all-hands','all hands','town hall','townhall'] },
  { label: 'Client meetings',         words: ['client','customer','stakeholder'] },
  { label: 'Interviews',              words: ['interview','candidate'] },
  { label: 'Deep work blocks',        words: ['deep work','focus block','writing time'] },
  { label: 'Exec / leadership',       words: ['exec','executive','leadership','ceo ',' ceo','cto ',' cto'] },
  { label: 'Networking & community',  words: ['meetup','summit','expo','conference','info session','community','rise ai','scale','ai thursday','connects'] },
  { label: 'Intro / discovery calls', words: ['intro','discovery','chemistry'] },
  { label: 'Catch-ups & syncs',       words: ['catchup','catch-up','catch up','sync','check-in','check in','weekly','standup','stand-up'] },
  { label: 'Internal builds',         words: ['debug','dashboard','engineering','sprint','planning','db ',' db'] },
];

export function classifyByLegacyTable(title: string | null | undefined): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  for (const ec of EVENT_TYPE_KEYWORDS) {
    if (ec.words.some((w) => t.includes(w))) return ec.label;
  }
  return null;
}

// ── Stakes scoring ──────────────────────────────────────────────────

export interface EngineFlags {
  cognitiveFragmentation?: boolean;
  visibilityAccumulation?: boolean;
  emotionalCarryover?: boolean;
  travelCompression?: boolean;
  executiveOverextension?: boolean;
  identityPressureSpike?: boolean;
}

export function pillarBaseWeight(p: Pillar): number { return PILLAR_META[p].baseWeight; }

export function stakesScore(et: EventType, flags?: EngineFlags): number {
  const base = pillarBaseWeight(et.primaryPillar);
  const dem = demandSum(et.demandProfile) * 5;
  const engineBoost = flags && Object.values(flags).some(Boolean) ? 20 : 0;
  return base + dem + engineBoost;
}

// ── Lead-event selection ─────────────────────────────────────────────

export interface CalendarEventLite {
  title: string | null | undefined;
  start_time: string | Date;
  end_time?: string | Date;
  attendees_count?: number | null;
  is_recurring?: boolean | null;
  is_organizer?: boolean | null;
}

export interface ScoredEvent<E extends CalendarEventLite = CalendarEventLite> {
  event: E;
  type: EventType | null;
  stakes: number;
}

const STAKES_THRESHOLD = 60;

export function survivesAttendeeOrDurationFloor(e: CalendarEventLite): boolean {
  const title = e.title || '';
  if (PERSONAL_BLOCK_PATTERN.test(title)) return false;
  if (classifyEvent(title)) return true;
  const att = e.attendees_count ?? 0;
  const start = new Date(e.start_time);
  const end = e.end_time ? new Date(e.end_time) : new Date(start.getTime() + 30 * 60000);
  const dur = (end.getTime() - start.getTime()) / 60000;
  if (dur < 15 && att === 0) return false;
  return true;
}

export type AttendeeTier = 'solo' | 'small' | 'group' | 'broadcast';
export function attendeeTier(e: Pick<CalendarEventLite, 'attendees_count'>): AttendeeTier {
  const att = e.attendees_count ?? 0;
  if (att <= 1) return 'solo';
  if (att <= 5) return 'small';
  if (att <= 20) return 'group';
  return 'broadcast';
}

export function scoreEvents<E extends CalendarEventLite>(events: E[], flags?: EngineFlags): ScoredEvent<E>[] {
  return events.map((e) => {
    const t = classifyEvent(e.title);
    return { event: e, type: t, stakes: t ? stakesScore(t, flags) : 0 };
  });
}

export function selectLeadEvent<E extends CalendarEventLite>(events: E[], flags?: EngineFlags): ScoredEvent<E> | null {
  const candidates = events.filter((e) => !isNoiseTitle(e.title)).filter(survivesAttendeeOrDurationFloor);
  if (candidates.length === 0) return null;
  const scored = scoreEvents(candidates, flags);
  const maxStakes = Math.max(...scored.map((s) => s.stakes));
  if (maxStakes >= STAKES_THRESHOLD) {
    const top = scored.filter((s) => s.stakes === maxStakes);
    top.sort((a, b) => new Date(a.event.start_time).getTime() - new Date(b.event.start_time).getTime());
    return top[0];
  }
  scored.sort((a, b) => new Date(a.event.start_time).getTime() - new Date(b.event.start_time).getTime());
  return scored[0];
}

export function rankByStakes<E extends CalendarEventLite>(events: E[], topN: number = 3, flags?: EngineFlags): ScoredEvent<E>[] {
  const candidates = events.filter((e) => !isNoiseTitle(e.title)).filter(survivesAttendeeOrDurationFloor);
  const scored = scoreEvents(candidates, flags);
  scored.sort((a, b) => {
    if (b.stakes !== a.stakes) return b.stakes - a.stakes;
    return new Date(a.event.start_time).getTime() - new Date(b.event.start_time).getTime();
  });
  return scored.slice(0, topN);
}

// ── High-stakes shorthand ────────────────────────────────────────────

export function isHighStakesTitle(title: string | null | undefined): boolean {
  const t = classifyEvent(title);
  if (!t) return false;
  return stakesScore(t) >= 75;
}

export function highStakesScore(title: string | null | undefined): number {
  const t = classifyEvent(title);
  if (!t) return 0;
  return Math.min(100, Math.round((stakesScore(t) / 150) * 100));
}

// ── Cross-provider dedupe ────────────────────────────────────────────

const PROVIDER_RANK: Record<string, number> = { google: 3, microsoft: 2, outlook: 2, apple: 1 };

const PROVIDER_RANK_BY_PLATFORM: Record<string, Record<string, number>> = {
  ios:     { apple: 3, google: 2, microsoft: 1, outlook: 1 },
  web:     { google: 3, microsoft: 2, outlook: 2, apple: 1 },
  unknown: { google: 3, microsoft: 2, outlook: 2, apple: 1 },
};

function normalizeTitle(t: string | null | undefined): string {
  return (t || '').toLowerCase().replace(/[\s\-_/\\.,:;!?'"()\[\]]+/g, ' ').trim();
}

function toMs(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

export type DedupableEvent = {
  id?: string;
  title?: string | null;
  start_time?: string | Date | null;
  end_time?: string | Date | null;
  provider?: string | null;
  attendees_count?: number | null;
  is_organizer?: boolean | null;
  created_at?: string | Date | null;
  [k: string]: unknown;
};

export function dedupeCalendarEvents<T extends DedupableEvent>(
  events: T[],
  opts?: { platform?: 'ios' | 'web' | 'unknown' },
): T[] {
  if (!Array.isArray(events) || events.length === 0) return [];
  const buckets = new Map<string, T>();
  const untitled: T[] = [];
  const rank = PROVIDER_RANK_BY_PLATFORM[opts?.platform ?? 'unknown'] ?? PROVIDER_RANK;

  for (const e of events) {
    const title = normalizeTitle(e.title);
    const startMs = toMs(e.start_time);
    if (!title || !startMs) { untitled.push(e); continue; }
    const key = `${title}|${startMs}`;
    const existing = buckets.get(key);
    if (!existing) { buckets.set(key, e); continue; }
    if (preferEvent(e, existing, rank)) buckets.set(key, e);
  }
  return [...buckets.values(), ...untitled];
}

function preferEvent<T extends DedupableEvent>(candidate: T, current: T, rank: Record<string, number> = PROVIDER_RANK): boolean {
  const cAtt = candidate.attendees_count ?? 0;
  const eAtt = current.attendees_count ?? 0;
  if (cAtt !== eAtt) return cAtt > eAtt;
  const cOrg = candidate.is_organizer ? 1 : 0;
  const eOrg = current.is_organizer ? 1 : 0;
  if (cOrg !== eOrg) return cOrg > eOrg;
  const cRank = rank[(candidate.provider || '').toLowerCase()] ?? 0;
  const eRank = rank[(current.provider || '').toLowerCase()] ?? 0;
  if (cRank !== eRank) return cRank > eRank;
  const cCreated = toMs(candidate.created_at);
  const eCreated = toMs(current.created_at);
  if (cCreated && eCreated && cCreated !== eCreated) return cCreated < eCreated;
  return false;
}

// ── Day-kind detection ───────────────────────────────────────────────

const TRAVEL_KEYWORDS = ['flight','airport','boarding','departure','arrival','layover','transit','train','red-eye','redeye'];
const AWAY_KEYWORDS = ['annual leave','holiday','vacation','pto','away','day off'];
const OOO_KEYWORDS = ['out of office','ooo'];

export function detectDayKindFromEvents(
  events: Array<{ title?: string | null }>,
): { kind: 'normal' | 'travel-day' | 'away-day' | 'ooo'; signalToken?: string } {
  for (const e of events) {
    const lower = (e.title || '').toLowerCase();
    if (!lower) continue;
    for (const kw of TRAVEL_KEYWORDS) {
      if (lower.includes(kw)) return { kind: 'travel-day', signalToken: 'travel' };
    }
  }
  for (const e of events) {
    const lower = (e.title || '').toLowerCase();
    if (!lower) continue;
    for (const kw of OOO_KEYWORDS) {
      if (lower.includes(kw)) return { kind: 'ooo', signalToken: 'out of office' };
    }
    for (const kw of AWAY_KEYWORDS) {
      if (lower.includes(kw)) return { kind: 'away-day', signalToken: kw };
    }
  }
  return { kind: 'normal' };
}
