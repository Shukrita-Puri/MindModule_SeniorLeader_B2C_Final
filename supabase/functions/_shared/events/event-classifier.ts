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

// ── Educational / non-organizer block ───────────────────────────────
//
// Single canonical pattern for "this looks like a course/webinar/learning
// session, not the user's own event". Consumers gate on it to avoid prepping
// for educational content the user only attends passively.
export const EDUCATIONAL_PATTERN = /\b(the power of|how to|masterclass|workshop:?|webinar:?|course:?|learn to|introduction to|build momentum|close your round|lessons from|secrets of|art of|guide to|tips for|strategies for|fundamentals of)\b/i;

export function isEducationalTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return EDUCATIONAL_PATTERN.test(title);
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

// ── Coarse downstream tokens & display labels ───────────────────────
//
// Maps shared subtype.id → the coarse event-type token historically used by
// HRV correlation maps, canonical-tag lookups, and dim scoring. Single
// source of truth: lives next to the classifier so no feature surface
// re-encodes the taxonomy.
const SUBTYPE_TO_COARSE: Record<string, string> = {
  'gov.board_meeting':           'board',
  'gov.board_committee':         'board',
  'gov.board_prep':              'board',
  'gov.investor_meeting':        'investor',
  'gov.earnings_call':           'investor',
  'gov.qbr':                     'quarterly-review',
  'gov.budget_review':           'finance',
  'gov.ma_discussion':           'ma',
  'gov.crisis':                  'crisis',
  'inf.fundraising':             'fundraising',
  'inf.negotiation':             'negotiation',
  'inf.client_presentation':     'client',
  'vis.media':                   'media-interview',
  'vis.all_hands':               'all-hands',
  'lead.executive_1on1':         '1:1',
  'lead.leadership_sync':        'leadership',
  'lead.performance_review':     'performance-review',
  'lead.difficult_conversation': 'layoff',
  'lead.layoff':                 'layoff',
  'lead.hiring_committee':       'hiring-interview',
  'str.strategy_planning':       'strategy',
  'str.deep_work':               'deep-work',
  'str.product_launch':          'launch',
  'conf.keynote':                'speaking',
  'conf.speaking':               'speaking',
  'conf.offsite':                'strategy',
  'conf.award':                  'speaking',
  'conf.customer_summit':        'speaking',
  'conf.networking':             'networking',
  'trv.long_haul':               'travel',
  'trv.flight':                  'travel',
  'rhy.catchup':                 'standup',
  'rhy.pto':                     'pto',
};

/**
 * Coarse event-type token derived from the shared classifier. Returns
 * 'other' when no subtype matches. Replaces per-feature keyword tables.
 */
export function coarseEventType(title: string | null | undefined): string {
  const et = classifyEvent(title);
  if (!et) return 'other';
  return SUBTYPE_TO_COARSE[et.id] ?? 'other';
}

/**
 * Presentation label for a calendar event ("Pre Board Meeting" etc.).
 * Sourced from the shared subtype's `label`; consumers should not maintain
 * parallel label maps.
 */
export function canonicalEventTag(title: string | null | undefined): string {
  const et = classifyEvent(title);
  if (!et) return 'Meeting Prep';
  // Subtype labels are user-facing already (e.g. "Board meeting"); wrap as
  // "Pre X" for the prep framing the plan generator uses.
  return `Pre ${et.label}`;
}

// Reverse map: coarse token → presentation label. Derived from the shared
// subtype labels (no parallel taxonomy). Used when only the coarse token is
// available downstream (e.g. HRV correlation cache keyed by coarse type).
const COARSE_TO_LABEL: Record<string, string> = (() => {
  const out: Record<string, string> = { 'other': 'Meeting Prep' };
  for (const et of EVENT_TYPES) {
    const coarse = SUBTYPE_TO_COARSE[et.id];
    if (!coarse) continue;
    if (!out[coarse]) out[coarse] = `Pre ${et.label}`;
  }
  return out;
})();

export function canonicalTagForCoarse(coarse: string | null | undefined): string {
  if (!coarse) return 'Meeting Prep';
  return COARSE_TO_LABEL[coarse] ?? 'Meeting Prep';
}

// ── Pressure / cluster floor (legacy DimA/DimB replacement) ─────────
//
// The plan generator's "legacy fallback gate" previously hardcoded two
// keyword tables (PRESSURE + CLUSTER). Both are now derived from the
// shared subtype: categoryId, primaryPillar, and demandProfile encode the
// same intent without a second taxonomy.

/** Categories that count as a pressure/cluster signal for legacy gating. */
const CLUSTER_CATEGORIES = new Set(['A', 'B', 'C', 'D', 'E', 'F']); // gov, influence, visibility, people, deep work, conferences

export function eventClusterSignal(title: string | null | undefined): boolean {
  const et = classifyEvent(title);
  if (!et) return false;
  return CLUSTER_CATEGORIES.has(et.categoryId);
}

/**
 * Returns whether the event is "pressure-flavored" — used to bump DimA on
 * top of attendee count. Derived from primaryPillar (Executive Presence) or
 * a meaningful visibility/political demand.
 */
export function eventPressureFlag(title: string | null | undefined): boolean {
  const et = classifyEvent(title);
  if (!et) return false;
  if (et.primaryPillar === 2) return true;
  const d = et.demandProfile;
  return (d.vis >= 2) || (d.pol >= 2);
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

const SUBTYPE_TO_LEGACY_BUCKET: Partial<Record<string, string>> = {
  'gov.board_meeting': 'Board / governance',
  'gov.board_committee': 'Board / governance',
  'gov.board_prep': 'Board / governance',
  'gov.investor_meeting': 'Investor calls',
  'gov.earnings_call': 'Investor calls',
  'gov.qbr': 'Reviews',
  'gov.budget_review': 'Reviews',
  'inf.fundraising': 'Investor calls',
  'inf.client_presentation': 'Client meetings',
  'vis.all_hands': 'All-hands',
  'lead.executive_1on1': '1:1s',
  'lead.leadership_sync': 'Exec / leadership',
  'lead.performance_review': 'Reviews',
  'lead.hiring_committee': 'Interviews',
  'str.deep_work': 'Deep work blocks',
  'str.strategy_planning': 'Deep work blocks',
  'str.product_launch': 'Internal builds',
  'conf.keynote': 'Networking & community',
  'conf.speaking': 'Networking & community',
  'conf.offsite': 'Networking & community',
  'conf.award': 'Networking & community',
  'conf.customer_summit': 'Networking & community',
  'conf.networking': 'Networking & community',
  'rhy.catchup': 'Catch-ups & syncs',
};

/**
 * Pattern-store / tactical-signals bucket. Preserves the historical
 * `causality_findings.signal_summary` label set, but resolves from the
 * canonical subtype first so readers/writers gradually stop depending on
 * parallel keyword tables.
 */
export function classifyPatternBucket(title: string | null | undefined): string | null {
  const subtype = classifyEvent(title);
  if (subtype) {
    const mapped = SUBTYPE_TO_LEGACY_BUCKET[subtype.id];
    if (mapped) return mapped;
  }
  if (!title) return null;
  const t = title.toLowerCase();
  for (const ec of EVENT_TYPE_KEYWORDS) {
    if (ec.words.some((w) => t.includes(w))) return ec.label;
  }
  return null;
}

export function classifyByLegacyTable(title: string | null | undefined): string | null {
  return classifyPatternBucket(title);
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

/**
 * F-14 — JIT lead-time fit boost.
 * When the event subtype declares `jitLeadTimeMinutes`, events whose
 * start falls inside that prep horizon (relative to `nowMs`) get a
 * stakes boost so the Brief mentions the event that is actually
 * actionable *now* rather than just the most-distant high-stakes one.
 *   - inside window (0..lead]              → +20
 *   - within 2× window (lead..2*lead]      → +10
 *   - past start but ≤ 60min after          → +5 (post-event prep)
 *   - otherwise                              →  0
 */
function jitLeadTimeBoost(et: EventType | null, startMs: number, nowMs: number): number {
  if (!et || !et.jitLeadTimeMinutes || !isFinite(startMs)) return 0;
  const minutesUntil = (startMs - nowMs) / 60_000;
  const lead = et.jitLeadTimeMinutes;
  if (minutesUntil >= 0 && minutesUntil <= lead) return 20;
  if (minutesUntil > lead && minutesUntil <= 2 * lead) return 10;
  if (minutesUntil < 0 && minutesUntil >= -60) return 5;
  return 0;
}

export function selectLeadEvent<E extends CalendarEventLite>(
  events: E[],
  flags?: EngineFlags,
  opts?: { nowMs?: number },
): ScoredEvent<E> | null {
  const candidates = events.filter((e) => !isNoiseTitle(e.title)).filter(survivesAttendeeOrDurationFloor);
  if (candidates.length === 0) return null;
  const nowMs = opts?.nowMs ?? Date.now();
  const scored = scoreEvents(candidates, flags).map((s) => {
    const startMs = new Date(s.event.start_time).getTime();
    const boost = jitLeadTimeBoost(s.type, startMs, nowMs);
    return boost > 0 ? { ...s, stakes: s.stakes + boost } : s;
  });
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
