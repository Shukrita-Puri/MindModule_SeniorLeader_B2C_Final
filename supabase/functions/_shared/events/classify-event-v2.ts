// OWNERSHIP: engineering. Layered event classifier v2. Additive — does NOT
// replace classifyEvent(). Designed to shadow-run alongside v1 behind a
// feature flag, writing parity rows to event_classifier_parity_log.
//
// Layer order (first non-null wins):
//   L0  status      — defensive cancelled/tentative read
//   L1  userTags    — explicit user-declared category override
//   L2  verbs       — presentation verb + isOrganizer
//   L3  roles       — attendee role mix (board/investor/customer/...)
//   L4  travel      — flight #, route code, travel verb, OR travel_state +
//                     travel-leaning token
//   L5  acronym     — acronym dictionary with airport-code corroboration gate
//   L6  dictionary  — v2 keyword match with excludeKeywords + word boundaries
//   L7  v1 fallback — calls existing classifyEvent(title) so shadow mode never
//                     regresses
//
// Pure function except for the OPTIONAL parity logger which writes one row
// per call. The logger swallows errors — classification must never block.

import { EVENT_TYPES, type EventType } from "./event-subtypes.ts";
import type { EventCategoryId } from "./event-categories.ts";
import { classifyEvent } from "./event-classifier.ts";
import { detectTravelFromTitle, extractBareAirportCodes } from "./travel-patterns.ts";
import { hasPresentationVerb } from "./presentation-verbs.ts";
import { findAcronymMatch } from "./acronym-dictionary.ts";

export type ResolvedBy =
  | 'layer0_status'
  | 'layer1_tags'
  | 'layer2_verbs'
  | 'layer3_roles'
  | 'layer4_travel_regex'
  | 'layer4_travel_state'
  | 'layer5_acronym'
  | 'layer6_dictionary'
  | 'layer7_v1_fallback'
  | 'unknown';

export type Confidence = 'high' | 'medium' | 'low';

export interface ClassifyV2Input {
  title: string | null | undefined;
  isOrganizer?: boolean | null;
  attendeeRoles?: string[];
  userTags?: string[];
  travelState?: 'home' | 'travelling' | 'arriving' | 'returning';
  eventMetadata?: Record<string, unknown> | null;
}

export interface ClassifyV2Result {
  category: EventCategoryId | null;
  subtypeId: string | null;
  confidence: Confidence;
  resolvedBy: ResolvedBy;
}

function subtypeById(id: string): EventType | undefined {
  return EVENT_TYPES.find((e) => e.id === id);
}

function resultFromSubtype(
  id: string,
  resolvedBy: ResolvedBy,
  confidence: Confidence,
): ClassifyV2Result {
  const st = subtypeById(id);
  return {
    category: st?.categoryId ?? null,
    subtypeId: st?.id ?? null,
    confidence,
    resolvedBy,
  };
}

// ── User-tag → category mapping (Layer 1) ────────────────────────────
const USER_TAG_TO_CATEGORY: Record<string, EventCategoryId> = {
  'board': 'A', 'governance': 'A', 'investor': 'A', 'earnings': 'A',
  'm&a': 'A', 'budget': 'A', 'finance': 'A', 'trustee': 'A',
  'fundraise': 'B', 'pitch': 'B', 'negotiation': 'B', 'client': 'B',
  'media': 'C', 'press': 'C', 'podcast': 'C', 'all-hands': 'C', 'town-hall': 'C',
  'stakeholder-comm': 'C', 'stakeholder': 'C',
  '1:1': 'D', 'performance-review': 'D', 'difficult': 'D', 'layoff': 'D', 'hiring': 'D',
  'strategy': 'E', 'deep-work': 'E', 'launch': 'E',
  'learning': 'E', 'community': 'E', 'review': 'E', 'compliance': 'E',
  'keynote': 'F', 'speaking': 'F', 'offsite': 'F', 'conference': 'F',
  'travel': 'G', 'flight': 'G', 'accommodation': 'G', 'travel-day': 'G',
  'sync': 'H', 'standup': 'H', 'catchup': 'H', 'pto': 'H', 'ooo': 'H',
  'holiday': 'H', 'wellness': 'H', 'family': 'H', 'social': 'H', 'recreation': 'H',
};

// v2 additive — deep-work / product-feedback override. When the title contains
// beta/product/user/customer feedback + a session/review/analysis marker AND
// the user is organizer, route to str.deep_work regardless of v1 dictionary
// (which historically caught "feedback" in lead.difficult_conversation).
const DEEP_WORK_FEEDBACK_RE = /\b(beta|user|customer|product)\s+(feedback|test\s+feedback)\b|\bfeedback\s+(session|review|analysis)\b/i;

function isDeepWorkFeedback(title: string, isOrganizer: boolean | null | undefined): boolean {
  if (!title) return false;
  if (!DEEP_WORK_FEEDBACK_RE.test(title)) return false;
  // Organizer signal is a strong positive but not required — the title itself
  // is specific enough. Kept flexible so calendar events without organizer
  // metadata still benefit from the fix.
  return isOrganizer !== false;
}

// ── Attendee-role → subtype mapping (Layer 3) ────────────────────────
function classifyByRoles(roles: string[]): { subtypeId: string; confidence: Confidence } | null {
  const set = new Set(roles.map((r) => r.toLowerCase()));
  // Priority order matters: most signal-rich roles first.
  if (set.has('board') || set.has('non-exec') || set.has('chair')) {
    return { subtypeId: 'gov.board_meeting', confidence: 'medium' };
  }
  if (set.has('investor') || set.has('lp') || set.has('vc')) {
    return { subtypeId: 'gov.investor_meeting', confidence: 'medium' };
  }
  if (set.has('journalist') || set.has('reporter') || set.has('press')) {
    return { subtypeId: 'vis.media', confidence: 'medium' };
  }
  if (set.has('customer') || set.has('client') || set.has('prospect')) {
    return { subtypeId: 'inf.client_presentation', confidence: 'medium' };
  }
  if (set.has('direct-report') && set.size <= 2) {
    return { subtypeId: 'lead.executive_1on1', confidence: 'medium' };
  }
  if (set.has('peer-exec') || set.has('co-founder')) {
    return { subtypeId: 'lead.leadership_sync', confidence: 'medium' };
  }
  if (set.has('candidate')) {
    return { subtypeId: 'lead.hiring_committee', confidence: 'medium' };
  }
  return null;
}

// ── L6: word-boundary dictionary match with excludeKeywords ──────────
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function dictionaryV2Match(
  title: string,
  excludedSubtypeIds: Set<string>,
): EventType | null {
  const lower = title.toLowerCase();
  for (const et of EVENT_TYPES) {
    if (!et.keywords?.length) continue;
    if (et.excludeKeywords?.some((ex) => lower.includes(ex.toLowerCase()))) {
      excludedSubtypeIds.add(et.id);
      continue;
    }
    const hit = et.keywords.some((kw) => {
      const k = kw.toLowerCase().trim();
      if (!k) return false;
      // If the keyword already contains a space or punctuation, substring is fine.
      if (/[\s:&\-/]/.test(k)) return lower.includes(k);
      const re = new RegExp(`(^|\\W)${escapeRe(k)}($|\\W)`);
      return re.test(lower);
    });
    if (hit) return et;
  }
  return null;
}

/**
 * Layered classification. Pure function — no IO. Use logParity() separately
 * if you want to record the divergence with v1.
 */
export function classifyEventV2(input: ClassifyV2Input): ClassifyV2Result {
  const title = (input.title ?? '').trim();

  // L0: status gate (defensive — most cancelled events are deleted before
  // we see them, but the iOS bridge occasionally surfaces tentative ones).
  const status = (input.eventMetadata?.['status'] as string | undefined)?.toLowerCase();
  if (status === 'cancelled' || status === 'canceled') {
    return { category: null, subtypeId: null, confidence: 'high', resolvedBy: 'layer0_status' };
  }

  if (!title) {
    return { category: null, subtypeId: null, confidence: 'low', resolvedBy: 'unknown' };
  }

  // L1: explicit user tags trump everything else.
  if (input.userTags?.length) {
    for (const tag of input.userTags) {
      const cat = USER_TAG_TO_CATEGORY[tag.toLowerCase()];
      if (cat) {
        return { category: cat, subtypeId: null, confidence: 'high', resolvedBy: 'layer1_tags' };
      }
    }
  }

  // L2: presentation verb + organizer → visibility.
  if (input.isOrganizer === true && hasPresentationVerb(title)) {
    return resultFromSubtype('vis.all_hands', 'layer2_verbs', 'medium');
  }

  // L2b (v2 additive): deep-work / product-feedback override — beats L6 & L7
  // to correct the "Mind Module - Beta test feedback" mis-route into D.
  if (isDeepWorkFeedback(title, input.isOrganizer)) {
    return resultFromSubtype('str.deep_work', 'layer2_verbs', 'high');
  }

  // L3: attendee roles (only when caller passed them).
  if (input.attendeeRoles?.length) {
    const r = classifyByRoles(input.attendeeRoles);
    if (r) return resultFromSubtype(r.subtypeId, 'layer3_roles', r.confidence);
  }

  // L4: travel detection (regex first, then travel_state corroboration).
  const travel = detectTravelFromTitle(title, input.travelState);
  if (travel.matched) {
    const subtype = /\b(long[-\s]?haul|red[-\s]?eye|overnight)\b/i.test(title)
      ? 'trv.long_haul'
      : 'trv.flight';
    const resolvedBy: ResolvedBy = travel.reason === 'travel_state_token'
      ? 'layer4_travel_state'
      : 'layer4_travel_regex';
    const confidence: Confidence = travel.reason === 'travel_state_token' ? 'medium' : 'high';
    return resultFromSubtype(subtype, resolvedBy, confidence);
  }

  // L5: acronym dictionary. The airport-code corroboration gate fires only
  // for dictionary entries whose subtype is travel-related — bare 3-letter
  // upper tokens routed to travel need another travel cue to count.
  // Non-travel acronyms (QBR, AGM, NED, PIP, ...) pass through unchanged.
  const acronym = findAcronymMatch(title);
  if (acronym) {
    const subtypeIsTravel = acronym.entry.subtypeId.startsWith('trv.');
    if (subtypeIsTravel) {
      const bareCodes = extractBareAirportCodes(title);
      const tokenUpper = acronym.matchedToken.toUpperCase();
      const isBareAirport = bareCodes.includes(tokenUpper) && tokenUpper.length === 3;
      if (!isBareAirport) {
        return resultFromSubtype(acronym.entry.subtypeId, 'layer5_acronym', 'high');
      }
      // Bare airport token with no travel cue: fall through.
    } else {
      return resultFromSubtype(acronym.entry.subtypeId, 'layer5_acronym', 'high');
    }
  }

  // L6: v2 dictionary match (word-boundary aware, honours excludeKeywords).
  const excludedByL6 = new Set<string>();
  const dictHit = dictionaryV2Match(title, excludedByL6);
  if (dictHit) {
    return resultFromSubtype(dictHit.id, 'layer6_dictionary', 'high');
  }

  // L7: v1 fallback so shadow mode never regresses below current behaviour.
  // BUT: skip v1 hits that landed on a subtype L6 explicitly excluded
  // (e.g. "Onboarding" v1→gov.board_meeting is suppressed because
  // gov.board_meeting.excludeKeywords contains 'onboarding').
  const v1 = classifyEvent(title);
  if (v1 && !excludedByL6.has(v1.id)) {
    return {
      category: v1.categoryId,
      subtypeId: v1.id,
      confidence: 'low',
      resolvedBy: 'layer7_v1_fallback',
    };
  }

  return { category: null, subtypeId: null, confidence: 'low', resolvedBy: 'unknown' };
}

// ── Parity logger ────────────────────────────────────────────────────
//
// Writes one row to event_classifier_parity_log per call. Intentionally
// best-effort: any DB error is swallowed so classification never blocks.
// Keep this function side-effect-only; do not return data from it.

function normaliseTitle(t: string | null | undefined): string {
  return (t ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 256);
}

export interface ParityLogInput {
  userId: string;
  eventId?: string | null;
  title: string | null | undefined;
  v1Category: string | null;
  v2: ClassifyV2Result;
  /**
   * When true, the caller has already determined that the user has a
   * permanent hardDemote row in event_priority_memory keyed by v1Category
   * AND v1Category differs from v2.category. Surfaced for manual review.
   */
  hardDemoteConflict?: boolean;
}

// deno-lint-ignore no-explicit-any
export async function logParity(supabase: any, input: ParityLogInput): Promise<void> {
  try {
    await supabase.from('event_classifier_parity_log').insert({
      user_id: input.userId,
      event_id: input.eventId ?? null,
      title_normalised: normaliseTitle(input.title),
      v1_category: input.v1Category,
      v2_category: input.v2.category,
      v2_subtype_id: input.v2.subtypeId,
      v2_confidence: input.v2.confidence,
      v2_resolved_by: input.v2.resolvedBy,
      hard_demote_conflict: input.hardDemoteConflict === true,
    });
  } catch (_err) {
    // Swallow — diagnostic write must never block classification.
  }
}