import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaudeText, callLovableAIText, CLAUDE_MODELS } from "../_shared/anthropic.ts";

// ── APNs Helper Functions ──

/**
 * Normalize a .p8 private key from env storage into clean base64 DER.
 * Handles: raw PEM, literal \\n escapes, URL-safe base64, extra whitespace.
 */
function normalizeP8Key(raw: string): string {
  let key = raw
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/[\s\r\n]+/g, '')
    .replace(/-/g, '+').replace(/_/g, '/');  // URL-safe → standard base64

  // Add padding if needed
  const pad = key.length % 4;
  if (pad === 2) key += '==';
  else if (pad === 3) key += '=';

  if (key.length === 0) throw new Error('[APNs] APNS_P8_KEY empty after normalization');
  if (!/^[A-Za-z0-9+/=]+$/.test(key)) {
    const bad = key.match(/[^A-Za-z0-9+/=]/);
    throw new Error(`[APNs] APNS_P8_KEY has invalid char at pos ${bad?.index}: charCode=${bad?.[0]?.charCodeAt(0)}, len=${key.length}`);
  }
  return key;
}

/**
 * Create a JWT for APNs authentication using ES256 (ECDSA P-256 + SHA-256).
 */
async function createApnsJwt(p8Key: string, keyId: string, teamId: string): Promise<string> {
  const pemBody = normalizeP8Key(p8Key);
  console.log(`[APNs] Key normalized OK: ${pemBody.length} base64 chars`);
  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const header = { alg: 'ES256', kid: keyId };
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: teamId, iat: now };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const headerB64 = encode(header);
  const claimsB64 = encode(claims);
  const signingInput = `${headerB64}.${claimsB64}`;

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${signingInput}.${sigB64}`;
}

/**
 * Send a push notification to a single iOS device via APNs HTTP/2.
 */
async function sendApnsPush(
  deviceToken: string,
  jwt: string,
  bundleId: string,
  title: string,
  body: string,
  customData: Record<string, string>,
  apnsHost: string = 'api.sandbox.push.apple.com',
  options: {
    ttlSeconds?: number;
    collapseId?: string;
    badge?: number;
  } = {},
): Promise<{ ok: boolean; status: number; reason: string; expirationTs: number; collapseId: string | null }> {
  // v5.3 — Punctuality + Clean Desk
  // Caller passes per-intent ttlSeconds and collapseId so APNs drops the push
  // once it stops being relevant ("no zombie notifications") and so a stale
  // queued one is replaced when the device reconnects.
  const ttlSeconds = Math.max(60, options.ttlSeconds ?? 6 * 3600);
  const expirationTs = Math.floor(Date.now() / 1000) + ttlSeconds;
  const collapseId = options.collapseId ?? null;
  const badge = typeof options.badge === 'number' ? Math.max(0, options.badge) : 1;

  const apnsPayload = {
    aps: {
      alert: { title, body },
      sound: 'default',
      badge,
      'mutable-content': 1,
    },
    ...customData,
  };

  const url = `https://${apnsHost}/3/device/${deviceToken}`;

  console.log(`[APNs] Sending to ${apnsHost} | topic=${bundleId} | token=${deviceToken.substring(0, 12)}... (${deviceToken.length} chars) | ttl=${ttlSeconds}s | collapse=${collapseId ?? '-'}`);

  const headers: Record<string, string> = {
    'Authorization': `bearer ${jwt}`,
    'apns-topic': bundleId,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'apns-expiration': String(expirationTs),
    'Content-Type': 'application/json',
  };
  if (collapseId) headers['apns-collapse-id'] = collapseId.substring(0, 64);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(apnsPayload),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`[APNs] Failed (${response.status}): ${errBody} – host=${apnsHost} topic=${bundleId} token=${deviceToken.substring(0, 12)}...`);
    let reason = errBody || `http_${response.status}`;
    try {
      const parsed = JSON.parse(errBody);
      if (parsed?.reason) reason = parsed.reason;
    } catch (_) { /* keep raw body */ }
    return { ok: false, status: response.status, reason, expirationTs, collapseId };
  }

  await response.text();
  console.log(`[APNs] Success – token=${deviceToken.substring(0, 12)}...`);
  return { ok: true, status: response.status, reason: 'success', expirationTs, collapseId };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ══════════════════════════════════════════════════════════════
// ── SIGNAL-FIRST ARCHITECTURE: Types & Constants ──
// ══════════════════════════════════════════════════════════════

const DAILY_NOTIFICATION_CAP = 3;
const LOW_TIERS = ['depleted', 'managing'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// MVP feature flag — set to true post-launch to enable P2/P3/P4/P6/P7
const MVP_POST_LAUNCH = false;

// v7 — Suppress legacy generic mid-day variants (priorities-count, consecutive-low).
// Framework code is preserved for future use; flip this on to re-enable.
const LEGACY_GENERIC_NUDGES_ENABLED = false;

// ── v5.3 — Per-intent TTL + collapse-id helpers ────────────────────────
// Maps the resolved nudge variant to its actionable window (TTL) and the
// collapse bucket APNs should de-dupe by. After expiration, APNs drops the
// queued push, so when the device reconnects the user only sees pushes that
// are still in their relevance window — exactly the Chief-of-Staff
// "no zombie notifications" contract.
function nudgeTtlSeconds(variantId: string, type: string): number {
  if (variantId === 'nudge_one_jit')              return 45 * 60;          // 45 min
  if (variantId === 'nudge_one_jit_post_travel')  return 45 * 60;
  if (variantId === 'nudge_one_morning')          return 3 * 3600;         // 3 h
  if (variantId === 'nudge_one_pre_flight')       return 45 * 60;          // 45 min
  if (variantId === 'nudge_one_post_arrival')     return 3 * 3600;
  if (variantId === 'nudge_two_jit')              return 45 * 60;
  if (variantId === 'nudge_two_recalibrate')      return 2 * 3600;         // 2 h
  if (variantId === 'nudge_two_reserves')         return 2 * 3600;
  if (variantId === 'nudge_two_priorities')       return 2 * 3600;
  if (variantId === 'nudge_two_in_flight')        return 90 * 60;          // 90 min
  if (variantId === 'nudge_three_lookahead')      return 10 * 3600;
  if (variantId.startsWith('nudge_three'))        return 6 * 3600;         // 6 h
  // Family fallback
  if (type === 'nudge_one') return 3 * 3600;
  if (type === 'nudge_two') return 2 * 3600;
  if (type === 'nudge_three') return 6 * 3600;
  return 3600;
}

function nudgeCollapseId(family: string, localDate: string, isTravel: boolean): string {
  // Travel pre-flight + in-flight collapse to a single "travel" bucket so
  // the latest update wins on reconnect (clean desk).
  if (isTravel) return `travel-${localDate}`;
  return `${family}-${localDate}`;
}

// ── v5 timing contract ─────────────────────────────────────────────────
// Hard floor: never deliver any push before this local hour, regardless of
// calendar anchor or evaluator. Protects "morning mindset" per CEO feedback.
const GLOBAL_EARLIEST_LOCAL = 8.0;     // 08:00
const GLOBAL_LATEST_LOCAL = 21.5;      // 21:30
// Cool-down after the user opens the app — they just engaged, don't push.
const APP_OPEN_COOLDOWN_MS = 60 * 60 * 1000; // 60 min (was 30)
// Per-user, per-cron-tick: at most one notification regardless of evaluators.
const INTRA_TICK_MAX = 1;

function isCanonicalIosApnsToken(token: string): boolean {
  return /^[0-9a-f]+$/.test(token) && [64, 72, 128].includes(token.length);
}

// Noise filter, day-kind detection, and high-stakes scoring all live in
// the shared executive-state-taxonomy module so every surface uses the
// same vocabulary (Section L of the taxonomy plan).
import {
  isNoiseTitle,
  detectDayKindFromEvents,
  isHighStakesTitle,
  highStakesScore,
  classifyEventBucket,
} from '../_shared/executive-state-taxonomy.ts';
import { detectClientPlatform, wrapDbWithCalendarPrimacy } from '../_shared/calendar-provider.ts';

function isNoiseEvent(title: string): boolean { return isNoiseTitle(title); }
function scoreEvent(title: string | null): number { return highStakesScore(title); }
function isHighStakes(title: string | null): boolean { return isHighStakesTitle(title); }

// Local travel-keyword list retained for the v5.3 pre-flight / in-flight sub-arc
// detection (a more specific concern than the shared day-kind detector).
const TRAVEL_KEYWORDS = ['flight','airport','boarding','departure','arrival','layover','transit','train','red-eye','redeye'];

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ── NudgeContext: all signals assembled once per user ──

interface CalendarEvent {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string;
  external_id: string;
  is_organizer?: boolean;
  attendees_count?: number;
}

interface CalendarGap {
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  nextEvent: CalendarEvent;
  postGapMeetingCount: number;
  postGapHasHighStakes: boolean;
}

interface WearableSignals {
  sleepScore: number | null;
  hrv: number | null;
  rhr: number | null;
  hrvBaseline30d: number | null;
  rhrBaseline30d: number | null;
  hrvDeltaPct: number | null;
  rhrElevated: boolean;
  totalSleepMinutes: number | null;
}

interface CoachSignals {
  pendingCommitments: Array<{ text: string; overdueDays: number; patternArea: string | null; metaSkill: string | null }>;
  activePatterns: Array<{ description: string; patternArea: string | null; observationCount: number }>;
  stressSignals: Array<{ topic: string; sessionId: string }>;
  lastSessionAt: Date | null;
  sessionsIn7d: number;
}

// v7 — Unified pattern store projection (read from causality_findings.signal_summary)
interface PatternSummary {
  event_to_hrv: Array<{
    event_type: string;
    n: number;
    hrvDeltaPct: number;
    rhrElevated: boolean;
    confidence: 'strong' | 'emerging';
    lastSeen: string;
  }>;
  event_to_rhr: Array<{
    event_type: string;
    n: number;
    rhrDeltaPct: number;
    confidence: 'strong' | 'emerging';
    lastSeen: string;
  }>;
  sleep_to_prs: { lowSleepPrsDeltaPct: number; n: number; confidence: 'strong' | 'emerging' } | null;
  consecutive_load: { tailDeltaPct: number; n: number; confidence: 'strong' | 'emerging' } | null;
}

interface NudgeContext {
  userId: string;
  todayStr: string;
  tomorrowStr: string;
  localHour: number;
  localMinute: number;
  localTime: number;
  dayOfWeek: number;
  dayName: string;
  isWeekend: boolean;
  // Calendar
  todayEvents: CalendarEvent[];
  tomorrowEvents: CalendarEvent[];
  nonNoiseEvents: CalendarEvent[];
  firstNonNoiseEvent: CalendarEvent | null;
  eventCount: number;
  highStakesEvents: CalendarEvent[];
  calendarGaps: CalendarGap[];
  dayType: 'light' | 'moderate' | 'heavy' | 'extreme';
  // Wearable
  wearable: WearableSignals;
  hasWearableData: boolean;
  // Coach
  coach: CoachSignals;
  // Check-in
  morningCheckinOutcome: string | null;
  afternoonCheckinOutcome: string | null;
  lastCheckinTime: Date | null;
  checkinCountToday: number;
  // Mastery plan
  pendingPracticeIds: string[];
  completedPracticeIds: string[];
  // JIT
  jitEvents: Array<{ eventId: string; eventTitle: string; eventStart: string; finalScore: number; externalId: string; confidenceBand: string }>;
  // Performance correlations (30d)
  coachSessionReadinessLift: number | null;
  practiceCompletionCorrelation: number | null;
  // Streak
  currentStreak: number;
  // Suppression signals
  lastAppOpen: Date | null;
  inMeetingNow: boolean;
  // Energy snapshot
  hrvDeltaPctFromSnapshot: number | null;
  // v7 — Unified pattern store (cross-event historical correlations)
  pattern: PatternSummary | null;
  // V8 — Day-shape awareness (copy only). Travel/away-day/ooo and post-travel.
  dayContext: {
    kind: 'normal' | 'travel-day' | 'away-day' | 'ooo';
    signalToken?: string;
    postTravel: boolean;
    // v5.3 — Travel arc sub-flags (derived from today's calendar). Each
    // rides one of the existing 3 slots — they never add a 4th send.
    preFlight?: { eventTitle: string; minutesUntil: number } | null;
    inFlight?: { eventTitle: string; minutesUntil: number } | null;
    // v5.3 — PTO / public-holiday "light touch" mode. Collapses the day to
    // a single morning nudge and skips JIT pre-event prep.
    ptoMode?: boolean;
  };
  // v5.3 — Server-computed badge: outstanding cognitive debt the user
  // can clear today. Falls back to 1 when we cannot compute it.
  badgeCount?: number;
}

interface NudgeCopy {
  title: string;
  body: string;
  variantId: string;
  // V8 telemetry — which provider produced this copy.
  // 'claude' / 'gemini' when AI succeeded, 'static' when fallback library used,
  // null when never set (defensive).
  aiProvider?: 'claude' | 'gemini' | 'static' | null;
}

// ══════════════════════════════════════════════════════════════
// ── A/B CTA Variant System (v5.1) ──
// Goal: measure which action-verb CTA drives the highest
// Brief/Plan opens. Each user is deterministically assigned to
// one of 4 variants per nudge_type (stable across days, so groups
// are clean). The variant rewrites the trailing CTA phrase of the
// body so we A/B test the lure, not the substance.
// ══════════════════════════════════════════════════════════════

export type CtaVariant = 'A' | 'B' | 'C' | 'D';

const CTA_VARIANTS: CtaVariant[] = ['A', 'B', 'C', 'D'];

// v8 — Meaning-Forward / Mind-Prep CTA. Every variant is a qualified
// mental-prep action verb (NEVER an unqualified "prep" — a CEO would read
// that as "prep the board deck"). The user's job is always to log in /
// check in and do MENTAL prep / recalibration / closing. Deep-link routing
// is unchanged on the payload — verbs only imply a destination, the system
// still controls the route.
const CTA_PHRASES: Record<CtaVariant, { brief: string; plan: string }> = {
  // A = control — calm, mental-prep
  A: { brief: 'check in to set your intention', plan: 'log in to prep your mind' },
  // B = state-framed
  B: { brief: 'check in to recalibrate',        plan: 'log in to prep your state' },
  // C = urgency / recovery
  C: { brief: 'log in to recalibrate your mind', plan: 'log in to prep your mind' },
  // D = close-of-day / week (evening variants — applyCtaVariant decides
  // which 'close' verb based on deep-link route)
  D: { brief: 'check in to close the day',       plan: 'check in to close the week' },
};

// Stable hash so the same user lands in the same bucket per nudge_type
function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function assignCtaVariant(userId: string, nudgeTypeFamily: string): CtaVariant {
  // Family = 'nudge_one' | 'nudge_two' | 'nudge_three' so JIT and
  // morning variants share a bucket per family per user.
  const idx = hashString(`${userId}::${nudgeTypeFamily}`) % CTA_VARIANTS.length;
  return CTA_VARIANTS[idx];
}

function nudgeFamily(nudgeType: string): string {
  if (nudgeType.startsWith('nudge_one'))   return 'nudge_one';
  if (nudgeType.startsWith('nudge_two'))   return 'nudge_two';
  if (nudgeType.startsWith('nudge_three')) return 'nudge_three';
  return nudgeType;
}

// v8 — recognise legacy V6/V7 phrases AND the new V8 qualified mind-prep
// verbs so any generated body can be rewritten to match the assigned
// variant. Anything matched here gets replaced with the variant's V8 verb.
const CTA_REWRITE_PATTERNS: { rx: RegExp; kind: 'brief' | 'plan' }[] = [
  // Legacy V5/V6 (still tolerated as input, normalised to V8 on rewrite)
  { rx: /open your brief/gi,                       kind: 'brief' },
  { rx: /open the brief/gi,                        kind: 'brief' },
  { rx: /open your plan/gi,                        kind: 'plan'  },
  { rx: /open the plan/gi,                         kind: 'plan'  },
  { rx: /open your prep plan/gi,                   kind: 'plan'  },
  { rx: /build your prep plan/gi,                  kind: 'plan'  },
  { rx: /build your plan/gi,                       kind: 'plan'  },
  { rx: /lock in your prep/gi,                     kind: 'plan'  },
  { rx: /tap to prep/gi,                           kind: 'plan'  },
  { rx: /see your prep/gi,                         kind: 'plan'  },
  { rx: /see your readiness/gi,                    kind: 'brief' },
  { rx: /see your plan/gi,                         kind: 'plan'  },
  { rx: /recalibrate now/gi,                       kind: 'brief' },
  { rx: /check in now/gi,                          kind: 'brief' },
  { rx: /open the app$/gi,                         kind: 'brief' },
  // V7 unqualified-prep verbs (banned in V8 — rewritten away)
  { rx: /open the app to prep tonight/gi,          kind: 'plan'  },
  { rx: /open the app to prep with a cool-down/gi, kind: 'plan'  },
  { rx: /check into the app to prep/gi,            kind: 'brief' },
  { rx: /go to the app to prep/gi,                 kind: 'plan'  },
  { rx: /open the app to prep/gi,                  kind: 'brief' },
  { rx: /\bprep now\b/gi,                          kind: 'brief' },
  // V8 surface forms (rewritten when assigned variant differs)
  { rx: /log in to prep your mind tonight/gi,      kind: 'plan'  },
  { rx: /log in to prep your mind/gi,              kind: 'plan'  },
  { rx: /log in to prep your state/gi,             kind: 'plan'  },
  { rx: /log in to recalibrate your mind/gi,       kind: 'brief' },
  { rx: /check in to recalibrate/gi,               kind: 'brief' },
  { rx: /check in to set your intention/gi,        kind: 'brief' },
  { rx: /check in to set tomorrow/gi,              kind: 'brief' },
  { rx: /check in to close the day/gi,             kind: 'brief' },
  { rx: /check in to close the week/gi,            kind: 'brief' },
  { rx: /check in to land the weekend/gi,          kind: 'brief' },
  { rx: /open your insights/gi,                    kind: 'brief' },
];

function applyCtaVariant(
  copy: NudgeCopy,
  variant: CtaVariant,
  deepLinkRoute: string,
): NudgeCopy {
  // Variant A is the control — leave body untouched but tag it.
  if (variant === 'A') {
    return { ...copy, variantId: `${copy.variantId}::A` };
  }

  let body = copy.body;
  let rewrote = false;
  for (const p of CTA_REWRITE_PATTERNS) {
    if (p.rx.test(body)) {
      const phrase = CTA_PHRASES[variant][p.kind];
      body = body.replace(p.rx, phrase);
      rewrote = true;
    }
  }

  // No canonical phrase found — append a CTA so the experiment still runs.
  if (!rewrote) {
    const kind: 'brief' | 'plan' = deepLinkRoute === '/executive-home' ? 'plan' : 'brief';
    const phrase = CTA_PHRASES[variant][kind];
    body = body.replace(/[.\s]+$/, '');
    body = `${body}, ${phrase}`;
  }

  return {
    ...copy,
    body: body.substring(0, 160),
    variantId: `${copy.variantId}::${variant}`,
  };
}

interface QualifiedNudge {
  type: string;
  copy: NudgeCopy;
  deepLinkRoute: string;
  eventReference?: string;
  commitmentText?: string;
  meetingTitle?: string;
  priority: number;
  // v7 — JIT-or-State anchoring + slot + signal strength for the comparator
  anchorKind: 'jit' | 'state';
  slot: 'morning' | 'afternoon' | 'evening';
  signalStrength: number; // 0..3 — higher wins ties (e.g., pattern-cited JIT > plain JIT)
}

// ── v7 helpers: pattern store reader + event classifier ────────────────

// Mirror of the EVENT_TYPE_KEYWORDS table in cause-effect-engine so smart-nudges
// can look up an event's bucket against the persisted pattern store.
const NUDGE_EVENT_TYPE_KEYWORDS: Array<{ label: string; words: string[] }> = [
  { label: 'School & family',         words: ['school', 'parents evening', 'open evening', 'parents', 'governor'] },
  { label: 'Board / governance',      words: ['board', 'governance'] },
  { label: 'Investor calls',          words: ['investor', 'vc ', ' vc', 'fundraise', 'raise', 'pitch deck'] },
  { label: 'Reviews',                 words: ['review', 'qbr', 'quarterly'] },
  { label: '1:1s',                    words: ['1:1', '1-1', 'one on one', '1on1'] },
  { label: 'All-hands',               words: ['all-hands', 'all hands', 'town hall', 'townhall'] },
  { label: 'Client meetings',         words: ['client', 'customer', 'stakeholder'] },
  { label: 'Interviews',              words: ['interview', 'candidate'] },
  { label: 'Deep work blocks',        words: ['deep work', 'focus block', 'writing time'] },
  { label: 'Exec / leadership',       words: ['exec', 'executive', 'leadership', 'ceo ', ' ceo', 'cto ', ' cto'] },
  { label: 'Networking & community',  words: ['meetup', 'summit', 'expo', 'conference', 'info session', 'community'] },
  { label: 'Intro / discovery calls', words: ['intro', 'discovery', 'chemistry'] },
  { label: 'Catch-ups & syncs',       words: ['catchup', 'catch-up', 'catch up', 'sync', 'check-in', 'check in', 'weekly', 'standup', 'stand-up'] },
  { label: 'Internal builds',         words: ['debug', 'dashboard', 'engineering', 'sprint', 'planning'] },
];

function classifyEventForPattern(title: string | null | undefined): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  for (const ec of NUDGE_EVENT_TYPE_KEYWORDS) {
    if (ec.words.some((w) => t.includes(w))) return ec.label;
  }
  return null;
}

async function loadPatternSummary(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<PatternSummary | null> {
  const { data, error } = await supabase
    .from('causality_findings')
    .select('signal_summary')
    .eq('user_id', userId)
    .eq('pattern_kind', 'cause_effect_v2')
    .order('computed_for_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[smart-nudges v7] loadPatternSummary error:', error.message);
    return null;
  }
  const sig = (data as any)?.signal_summary;
  if (!sig) return null;
  return {
    event_to_hrv: Array.isArray(sig.event_to_hrv) ? sig.event_to_hrv : [],
    event_to_rhr: Array.isArray(sig.event_to_rhr) ? sig.event_to_rhr : [],
    sleep_to_prs: sig.sleep_to_prs ?? null,
    consecutive_load: sig.consecutive_load ?? null,
  };
}

function findEventPattern(
  pattern: PatternSummary | null,
  eventTitle: string | null | undefined,
): { hrvDeltaPct: number; n: number; rhrElevated: boolean; confidence: 'strong' | 'emerging' } | null {
  if (!pattern) return null;
  const bucket = classifyEventForPattern(eventTitle);
  if (!bucket) return null;
  const hit = pattern.event_to_hrv.find((p) => p.event_type === bucket);
  if (!hit) return null;
  if (hit.confidence !== 'strong' && hit.confidence !== 'emerging') return null;
  if (hit.hrvDeltaPct >= 0 && !hit.rhrElevated) return null;
  return hit;
}

// ══════════════════════════════════════════════════════════════
// ── buildNudgeContext() – Central Signal Assembly ──
// ══════════════════════════════════════════════════════════════

async function buildNudgeContext(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  todayStr: string,
  tomorrowStr: string,
  localHour: number,
  localMinute: number,
  dayOfWeek: number,
  currentStreak: number,
  lastAppOpen: Date | null,
): Promise<NudgeContext> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // V8 — yesterday's date string (local) for post-travel awareness
  const yesterdayDate = new Date(`${todayStr}T00:00:00`);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

  // All queries in parallel
  const [
    { data: todayEventsRaw },
    { data: tomorrowEventsRaw },
    { data: yesterdayEventsRaw },
    { data: latestWearable },
    { data: wearable30d },
    { data: latestSnapshot },
    { data: pendingCommitments },
    { data: activePatterns },
    { data: recentSessions },
    { data: todayCheckins },
    { data: todayRituals },
    { data: jitEventsRaw },
    { data: practiceSessions30d },
    { data: checkins30d },
  ] = await Promise.all([
    supabase.from('primary_calendar_events')
      .select('id, title, start_time, end_time, external_id, is_organizer, attendees_count')
      .eq('user_id', userId)
      .gte('start_time', `${todayStr}T00:00:00`)
      .lte('start_time', `${todayStr}T23:59:59`)
      .order('start_time', { ascending: true }),
    supabase.from('primary_calendar_events')
      .select('id, title, start_time, end_time, external_id, is_organizer, attendees_count')
      .eq('user_id', userId)
      .gte('start_time', `${tomorrowStr}T00:00:00`)
      .lte('start_time', `${tomorrowStr}T23:59:59`)
      .order('start_time', { ascending: true }),
    supabase.from('primary_calendar_events')
      .select('id, title, start_time')
      .eq('user_id', userId)
      .gte('start_time', `${yesterdayStr}T00:00:00`)
      .lte('start_time', `${yesterdayStr}T23:59:59`),
    supabase.from('wearable_data')
      .select('hrv, resting_heart_rate, sleep_score, total_sleep_minutes, summary_date')
      .eq('user_id', userId)
      .order('summary_date', { ascending: false })
      .limit(1),
    supabase.from('wearable_data')
      .select('hrv, resting_heart_rate')
      .eq('user_id', userId)
      .gte('summary_date', thirtyDaysAgo.split('T')[0])
      .not('hrv', 'is', null),
    supabase.from('energy_snapshots')
      .select('oura_readiness, computed_data')
      .eq('user_id', userId)
      .eq('snapshot_date', todayStr)
      .limit(1)
      .maybeSingle(),
    supabase.from('coach_accountability_tracker')
      .select('commitment_text, committed_at, check_in_due_date, status, pattern_area, meta_skill')
      .eq('user_id', userId)
      .eq('status', 'pending'),
    supabase.from('coach_pattern_observations')
      .select('pattern_description, pattern_area, observation_count')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('observation_count', { ascending: false })
      .limit(5),
    supabase.from('dialogue_sessions')
      .select('id, started_at, session_title, flow_type')
      .eq('user_id', userId)
      .eq('flow_type', 'coach')
      .gte('started_at', sevenDaysAgo)
      .order('started_at', { ascending: false }),
    supabase.from('daily_checkins')
      .select('outcome, time_window, timestamp')
      .eq('user_id', userId)
      .eq('checkin_date', todayStr)
      .order('timestamp', { ascending: true }),
    supabase.from('daily_ritual_completions')
      .select('recommended_practice_ids, completed_practice_ids, session_period, completion_status')
      .eq('user_id', userId)
      .eq('ritual_date', todayStr),
    supabase.from('jit_event_context')
      .select('id, event_title, event_start, final_score, confidence_band')
      .eq('user_id', userId)
      .gte('event_start', new Date(now.getTime() + 30 * 60000).toISOString())
      .lte('event_start', new Date(now.getTime() + 360 * 60000).toISOString())
      .gte('final_score', 55)
      .order('final_score', { ascending: false }),
    supabase.from('practice_sessions')
      .select('completed_at, completed, content_id')
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('created_at', thirtyDaysAgo),
    supabase.from('daily_checkins')
      .select('checkin_date, outcome, time_window')
      .eq('user_id', userId)
      .gte('checkin_date', thirtyDaysAgo.split('T')[0])
      .order('checkin_date', { ascending: true }),
  ]);

  // Fetch session summaries separately (depends on recentSessions)
  const sessionIds = (recentSessions || []).map(s => s.id).filter(Boolean);
  const { data: sessionSummaries } = sessionIds.length > 0
    ? await supabase.from('coach_session_summaries')
        .select('session_id, key_topics, commitments_made')
        .in('session_id', sessionIds)
    : { data: [] as any[] };

  // Process wearable signals
  const latestW = latestWearable?.[0];
  const hasWearableData = latestW !== null && latestW !== undefined;

  const hrvValues = (wearable30d || []).map(w => w.hrv).filter((v): v is number => v !== null);
  const rhrValues = (wearable30d || []).map(w => w.resting_heart_rate).filter((v): v is number => v !== null);
  const hrvBaseline = hrvValues.length > 0 ? hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length : null;
  const rhrBaseline = rhrValues.length > 0 ? rhrValues.reduce((a, b) => a + b, 0) / rhrValues.length : null;

  const hrvDeltaPct = (latestW?.hrv && hrvBaseline) 
    ? Math.round(((latestW.hrv - hrvBaseline) / hrvBaseline) * 100) 
    : null;
  const rhrElevated = (latestW?.resting_heart_rate && rhrBaseline)
    ? latestW.resting_heart_rate > rhrBaseline * 1.1
    : false;

  const snapshotComputed = latestSnapshot?.computed_data as Record<string, unknown> | null;
  const hrvDeltaPctFromSnapshot = snapshotComputed?.hrv_delta_pct as number | null ?? hrvDeltaPct;

  // Process calendar
  const todayEvents = (todayEventsRaw || []) as CalendarEvent[];
  const tomorrowEvents = (tomorrowEventsRaw || []) as CalendarEvent[];
  const nonNoiseEvents = todayEvents.filter(e => !isNoiseEvent(e.title || ''));
  const highStakesEvents = nonNoiseEvents.filter(e => isHighStakes(e.title));

  const eventCount = nonNoiseEvents.length;
  let dayType: 'light' | 'moderate' | 'heavy' | 'extreme' = 'light';
  if (eventCount >= 8) dayType = 'extreme';
  else if (eventCount >= 6) dayType = 'heavy';
  else if (eventCount >= 3) dayType = 'moderate';

  // Calendar gaps (≥20 min between events)
  const calendarGaps: CalendarGap[] = [];
  for (let i = 0; i < nonNoiseEvents.length - 1; i++) {
    const currentEnd = new Date(nonNoiseEvents[i].end_time);
    const nextStart = new Date(nonNoiseEvents[i + 1].start_time);
    const gapMs = nextStart.getTime() - currentEnd.getTime();
    const gapMinutes = gapMs / 60000;
    if (gapMinutes >= 20) {
      const postGapEvents = nonNoiseEvents.slice(i + 1);
      calendarGaps.push({
        startTime: currentEnd,
        endTime: nextStart,
        durationMinutes: Math.round(gapMinutes),
        nextEvent: nonNoiseEvents[i + 1],
        postGapMeetingCount: postGapEvents.length,
        postGapHasHighStakes: postGapEvents.some(e => isHighStakes(e.title)),
      });
    }
  }

  const inMeetingNow = todayEvents.some(e => {
    const start = new Date(e.start_time);
    const end = new Date(e.end_time);
    return now >= start && now <= end;
  });

  // Coach signals
  const commitments = (pendingCommitments || []).map(c => {
    const dueDate = c.check_in_due_date ? new Date(c.check_in_due_date) : null;
    const overdueDays = dueDate ? Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86400000)) : 0;
    return {
      text: c.commitment_text,
      overdueDays,
      patternArea: c.pattern_area,
      metaSkill: c.meta_skill,
    };
  });

  const stressSignals: Array<{ topic: string; sessionId: string }> = [];
  for (const summary of (sessionSummaries || [])) {
    const topics = summary.key_topics as string[] | null;
    if (topics) {
      for (const topic of topics) {
        const lower = topic.toLowerCase();
        if (lower.includes('stress') || lower.includes('anxiety') || lower.includes('worried') ||
            lower.includes('nervous') || lower.includes('overwhelm') || lower.includes('dread')) {
          stressSignals.push({ topic, sessionId: summary.session_id });
        }
      }
    }
  }

  const lastCoachSession = recentSessions?.[0];
  const lastSessionAt = lastCoachSession?.started_at ? new Date(lastCoachSession.started_at) : null;

  // Check-in data
  const morningCheckin = (todayCheckins || []).find(c => c.time_window === 'morning');
  const afternoonCheckin = (todayCheckins || []).find(c => c.time_window === 'afternoon');
  const lastCheckin = (todayCheckins || []).length > 0
    ? new Date((todayCheckins || [])[(todayCheckins || []).length - 1].timestamp)
    : null;

  // Mastery plan
  const allRecommended = (todayRituals || []).flatMap(r => r.recommended_practice_ids || []);
  const allCompleted = (todayRituals || []).flatMap(r => r.completed_practice_ids || []);
  const pendingPracticeIds = allRecommended.filter(id => !allCompleted.includes(id));

  // Performance correlation
  let coachSessionReadinessLift: number | null = null;
  let practiceCompletionCorrelation: number | null = null;

  if ((checkins30d || []).length >= 10) {
    const checkinMap = new Map<string, string>();
    for (const c of (checkins30d || [])) {
      if (c.time_window === 'morning') {
        checkinMap.set(c.checkin_date, c.outcome);
      }
    }

    const coachSessionDates = new Set((recentSessions || []).map(s => s.started_at?.split('T')[0]).filter(Boolean));
    const coachDayAfterOutcomes: string[] = [];
    const nonCoachDayOutcomes: string[] = [];

    for (const [date, outcome] of checkinMap) {
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];
      if (coachSessionDates.has(prevDateStr)) {
        coachDayAfterOutcomes.push(outcome);
      } else {
        nonCoachDayOutcomes.push(outcome);
      }
    }

    const outcomeScore = (o: string) => o === 'peak' ? 5 : o === 'strong' ? 4 : o === 'steady' ? 3 : o === 'managing' ? 2 : 1;

    if (coachDayAfterOutcomes.length >= 2 && nonCoachDayOutcomes.length >= 2) {
      const coachAvg = coachDayAfterOutcomes.reduce((a, o) => a + outcomeScore(o), 0) / coachDayAfterOutcomes.length;
      const nonCoachAvg = nonCoachDayOutcomes.reduce((a, o) => a + outcomeScore(o), 0) / nonCoachDayOutcomes.length;
      if (nonCoachAvg > 0) {
        coachSessionReadinessLift = Math.round(((coachAvg - nonCoachAvg) / nonCoachAvg) * 100);
      }
    }

    const practiceDates = new Set(
      (practiceSessions30d || []).map(p => p.completed_at?.split('T')[0]).filter(Boolean)
    );
    const practiceDayAfterOutcomes: string[] = [];
    const noPracticeDayOutcomes: string[] = [];

    for (const [date, outcome] of checkinMap) {
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];
      if (practiceDates.has(prevDateStr)) {
        practiceDayAfterOutcomes.push(outcome);
      } else {
        noPracticeDayOutcomes.push(outcome);
      }
    }

    if (practiceDayAfterOutcomes.length >= 2 && noPracticeDayOutcomes.length >= 2) {
      const practiceAvg = practiceDayAfterOutcomes.reduce((a, o) => a + outcomeScore(o), 0) / practiceDayAfterOutcomes.length;
      const noPracticeAvg = noPracticeDayOutcomes.reduce((a, o) => a + outcomeScore(o), 0) / noPracticeDayOutcomes.length;
      if (noPracticeAvg > 0) {
        practiceCompletionCorrelation = Math.round(((practiceAvg - noPracticeAvg) / noPracticeAvg) * 100);
      }
    }
  }

  // JIT events
  const jitEvents = (jitEventsRaw || []).map(e => ({
    eventId: e.id,
    eventTitle: e.event_title,
    eventStart: e.event_start,
    finalScore: e.final_score || 0,
    externalId: e.id,
    confidenceBand: e.confidence_band || 'low',
  }));

  return {
    userId,
    todayStr,
    tomorrowStr,
    localHour,
    localMinute,
    localTime: localHour + localMinute / 60,
    dayOfWeek,
    dayName: DAYS[dayOfWeek],
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    todayEvents,
    tomorrowEvents,
    nonNoiseEvents,
    firstNonNoiseEvent: nonNoiseEvents.length > 0 ? nonNoiseEvents[0] : null,
    eventCount,
    highStakesEvents,
    calendarGaps,
    dayType,
    wearable: {
      sleepScore: latestW?.sleep_score ?? null,
      hrv: latestW?.hrv ?? null,
      rhr: latestW?.resting_heart_rate ?? null,
      hrvBaseline30d: hrvBaseline,
      rhrBaseline30d: rhrBaseline,
      hrvDeltaPct,
      rhrElevated,
      totalSleepMinutes: latestW?.total_sleep_minutes ?? null,
    },
    hasWearableData,
    coach: {
      pendingCommitments: commitments,
      activePatterns: (activePatterns || []).map(p => ({
        description: p.pattern_description,
        patternArea: p.pattern_area,
        observationCount: p.observation_count || 0,
      })),
      stressSignals,
      lastSessionAt,
      sessionsIn7d: (recentSessions || []).length,
    },
    morningCheckinOutcome: morningCheckin?.outcome || null,
    afternoonCheckinOutcome: afternoonCheckin?.outcome || null,
    lastCheckinTime: lastCheckin,
    checkinCountToday: (todayCheckins || []).length,
    pendingPracticeIds,
    completedPracticeIds: allCompleted,
    jitEvents,
    coachSessionReadinessLift,
    practiceCompletionCorrelation,
    currentStreak,
    lastAppOpen,
    inMeetingNow,
    hrvDeltaPctFromSnapshot,
    pattern: null, // Hydrated by main handler before evaluators run
    dayContext: (() => {
      const today = detectDayKindFromEvents(todayEvents);
      const yesterday = detectDayKindFromEvents((yesterdayEventsRaw || []) as Array<{ title?: string | null }>);
      // v5.3 — Travel arc sub-flags. Travel today = a calendar event whose
      // title matches a TRAVEL_KEYWORDS (flight/airport/boarding/...).
      let preFlight: { eventTitle: string; minutesUntil: number } | null = null;
      let inFlight: { eventTitle: string; minutesUntil: number } | null = null;
      if (today.kind === 'travel-day') {
        const nowMs = now.getTime();
        const travelEvents = todayEvents.filter(e => {
          const t = (e.title || '').toLowerCase();
          return TRAVEL_KEYWORDS.some(kw => t.includes(kw));
        });
        // pre-flight: first travel event starting in 60–240 min
        for (const e of travelEvents) {
          const startMs = new Date(e.start_time).getTime();
          const m = Math.round((startMs - nowMs) / 60000);
          if (m >= 60 && m <= 240) { preFlight = { eventTitle: e.title || 'Travel', minutesUntil: m }; break; }
        }
        // in-flight: now is inside a travel event ≥ 90 min long
        for (const e of travelEvents) {
          const startMs = new Date(e.start_time).getTime();
          const endMs = new Date(e.end_time).getTime();
          const lengthMin = (endMs - startMs) / 60000;
          if (lengthMin >= 90 && nowMs >= startMs && nowMs <= endMs) {
            const m = Math.round((nowMs - startMs) / 60000);
            inFlight = { eventTitle: e.title || 'Flight', minutesUntil: m };
            break;
          }
        }
      }
      return {
        kind: today.kind,
        signalToken: today.signalToken,
        postTravel: yesterday.kind === 'travel-day',
        preFlight,
        inFlight,
        // v5.3 — PTO / public-holiday "light touch": away-day or ooo today.
        ptoMode: today.kind === 'away-day' || today.kind === 'ooo',
      };
    })(),
    badgeCount: (() => {
      // v5.3 — Intelligent badge: outstanding cognitive debt the user can
      // clear today. Falls back to 1 when there is nothing to count.
      const open = pendingPracticeIds.length;
      const checkinDue = (() => {
        if (localHour < 12) return morningCheckin ? 0 : 1;
        if (localHour < 18) return afternoonCheckin ? 0 : 1;
        return ((todayCheckins || []).length === 0) ? 1 : 0;
      })();
      const total = open + checkinDue;
      return total > 0 ? Math.min(total, 9) : 1;
    })(),
  };
}

// ══════════════════════════════════════════════════════════════
// ── Wearable signal line builders (omit when no data) ──
// ══════════════════════════════════════════════════════════════

function buildWearableLines(ctx: NudgeContext): string {
  if (!ctx.hasWearableData) return '';
  
  const lines: string[] = [];
  if (ctx.wearable.sleepScore !== null) {
    lines.push(`- Sleep score: ${ctx.wearable.sleepScore}`);
  }
  if (ctx.wearable.hrvDeltaPct !== null) {
    lines.push(`- HRV vs baseline: ${ctx.wearable.hrvDeltaPct}%`);
  }
  if (ctx.wearable.rhrElevated) {
    lines.push(`- RHR: elevated above baseline`);
  } else if (ctx.wearable.rhr !== null) {
    lines.push(`- RHR: normal`);
  }
  return lines.join('\n');
}

function buildWearablePriorityLines(ctx: NudgeContext): string {
  if (!ctx.hasWearableData) return '';
  
  const lines: string[] = [];
  if (ctx.wearable.sleepScore !== null && ctx.wearable.sleepScore < 60) {
    lines.push('PRIORITY: Lead with recovery signal – sleep was poor');
  }
  if (ctx.wearable.hrvDeltaPct !== null && ctx.wearable.hrvDeltaPct < -15) {
    lines.push('PRIORITY: Lead with HRV recovery signal');
  }
  return lines.join('\n');
}

// V8 — Day-shape awareness line for AI prompts. Empty when normal & no post-travel.
function buildDayShapeLine(ctx: NudgeContext): string {
  const dc = ctx.dayContext;
  if (dc.kind === 'normal' && !dc.postTravel) return '';
  const parts: string[] = [];
  if (dc.kind === 'travel-day') {
    parts.push('Today shape: travel on the calendar — name "travel" verbatim (no long/short-haul).');
  } else if (dc.kind === 'away-day') {
    parts.push('Today shape: away-day — acknowledge the day away.');
  } else if (dc.kind === 'ooo') {
    parts.push('Today shape: out of office — acknowledge it.');
  }
  if (dc.postTravel) {
    parts.push('Recovery context: yesterday included travel — body may still be carrying load. Lead the meaning sentence with this awareness.');
  }
  return parts.join('\n');
}

// ══════════════════════════════════════════════════════════════
// ── Post-generation fabrication validation ──
// ══════════════════════════════════════════════════════════════

const FABRICATION_PATTERNS = [
  /\d+%/,
  /\d+\s*ms/i,
  /below baseline|above baseline/i,
  /your HRV|recovery score/i,
];

function containsFabricatedWearableData(body: string, hasWearableData: boolean): boolean {
  if (hasWearableData) return false;
  return FABRICATION_PATTERNS.some(pattern => pattern.test(body));
}

// v6 — title-case word truncation for long event titles to keep CTAs scannable
function truncateEventTitle(title: string | null | undefined): string {
  const t = (title || '').trim();
  if (!t) return 'your meeting';
  if (t.length <= 20) return t;
  return t.split(/\s+/).slice(0, 3).join(' ');
}

// v6 — copy-contract lint shared by AI output and any future fallback editor.
// Returns null if body passes; returns a string reason if it must be rejected.
const FORBIDDEN_WORDS_V6 = [
  'wellness','mindful','mindfulness','relax','breathe','calm','recharge','self-care','self care',
  'streak','keep it up','well done','great job',
  'productive','productivity','intent','strategy','strategic',
  'set the tone','your day your terms','loaded day','5 days behind you','plan the week',
  'come back','check in when',
  // v6.1 — ban mechanical / robotic phrasing flagged by CEO review
  'decision posture','decision readiness','mental sharpness','anchor sharpness',
  'anchor mental','lock in decision','set decision','set posture','decision-ready',
  'optimal performance','peak performance','performance state','cognitive load',
  'capacity','reserves','baseline','trajectory reset','reset trajectory',
  // v8 — passive-consumption verbs (defeat the "open the app and do it" principle)
  'your prep is ready','prep is ready','your plan is ready','your brief is ready',
  'see your prep','see your plan','see your readiness','tap to prep',
  // v8 — unqualified V7 prep verbs (CEO reads "prep" as strategic prep, not mental)
  'open the app to prep','check into the app to prep','go to the app to prep',
  'prep now','open the app to prep tonight','open the app to prep with a cool-down',
];
const ALLOWED_CTA_VERBS_V6 = [
  'open your brief','open your plan','open your prep plan','open your readiness',
  'build your prep plan','build your plan',
  'recalibrate now','close the day','close the week','close the loop',
  'lock in your prep','tap to prep','see your prep','see your plan','see your readiness',
  // v6.1 — short, human CTAs
  'check in now','open the app','prep now','take 2 minutes',
];
function violatesCopyContractV6(body: string): string | null {
  const lower = body.toLowerCase();
  for (const w of FORBIDDEN_WORDS_V6) {
    const rx = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (rx.test(lower)) return `forbidden word: "${w}"`;
  }
  if (!ALLOWED_CTA_VERBS_V6.some(v => lower.includes(v))) {
    return 'no allowed CTA verb';
  }
  // No placeholder tokens
  if (/\{[a-z_]+\}|\bN\b|--/i.test(body)) return 'placeholder token detected';
  // v6.1 — hard length ceiling (CEO feedback: notifications too long)
  const wordCount = body.trim().split(/\s+/).length;
  if (wordCount > 14) return `body too long (${wordCount} words, max 14)`;
  if (body.length > 95) return `body too long (${body.length} chars, max 95)`;
  return null;
}

// ── v8 — Meaning-Forward + Mind-Prep CTA contract ──────────────────────
// Three principles, enforced verbatim:
//   1. Lead with meaning, not the data point.  (the metric, if used, sits
//      INSIDE a meaning sentence — never as the whole first sentence).
//   2. Title = state or moment.  Body = context + one clear action.
//   3. CTA always ends at a specific app screen via a "log in / check in /
//      open" verb that QUALIFIES the prep as mental (mind / state /
//      recalibrate / close / set / land).  Unqualified "prep" is banned.
const ALLOWED_CTA_VERBS_V8 = [
  'log in to prep your mind tonight',
  'log in to prep your mind',
  'log in to prep your state',
  'log in to recalibrate your mind',
  'check in to recalibrate',
  'check in to set your intention',
  'check in to set tomorrow',
  'check in to close the day',
  'check in to close the week',
  'check in to land the weekend',
  'open your insights',
];

// V8 — body must reference at least one real, named context token.
// Sources: a calendar event title, a numeric physiological signal with
// unit, a countable today-state, a check-in outcome word, or a
// minutes-until / clock-time for a real event.
const NAMED_CONTEXT_RX_DEFAULT = [
  /\b(HRV|RHR|HR|sleep)\b\s*[+\-]?\d/i,                               // HRV -22%, Sleep 62
  /\b\d+\s*\/\s*100\b/,                                                // 62/100
  /\b\d+\s*(meeting|meetings|priority|priorities|min|minutes|day|days)\b/i,
  /\b(in|at)\s+\d{1,2}(?::\d{2})?\s*(min|minutes|am|pm|h)?\b/i,        // in 25 min, at 10am
  /\b(started low|managing|depleted|heavy|low|peak|strong|focused|overloaded)\b/i,
];
function requiresNamedContextToken(
  body: string,
  ctx?: { eventTitles?: string[]; checkinWord?: string | null },
): boolean {
  if (NAMED_CONTEXT_RX_DEFAULT.some(rx => rx.test(body))) return true;
  const titles = ctx?.eventTitles ?? [];
  for (const t of titles) {
    if (!t || t.length < 3) continue;
    if (body.toLowerCase().includes(t.toLowerCase())) return true;
    // Title-cased words from a real event title (3+ chars) also count.
    const head = t.split(/\s+/).slice(0, 3).join(' ');
    if (head.length >= 3 && body.toLowerCase().includes(head.toLowerCase())) return true;
  }
  if (ctx?.checkinWord && body.toLowerCase().includes(ctx.checkinWord.toLowerCase())) return true;
  return false;
}

// V8 — first sentence must NOT be a bare metric statement. The metric, if
// used, must be embedded INSIDE a meaning sentence (parenthetical or clause).
function violatesMeaningSentence(body: string): string | null {
  const first = body.split(/(?<=[.!?])\s+/)[0]?.trim() ?? body.trim();
  // Bare metric leads (HRV -22% today, RHR +9 bpm, Sleep 62/100, etc.)
  if (/^(HRV|RHR|HR|Sleep|Sleep score)\s*[+\-]?\d[^.]*$/i.test(first)) {
    return `first sentence is a bare metric: "${first}"`;
  }
  // First sentence is purely a number+unit clause with no human meaning verb.
  if (/^[+\-]?\d+\s*(%|bpm|\/100)\b[^.]*$/i.test(first)) {
    return `first sentence is a bare number+unit: "${first}"`;
  }
  return null;
}

function violatesCopyContractV8(
  body: string,
  ctx?: { eventTitles?: string[]; checkinWord?: string | null },
): string | null {
  const lower = body.toLowerCase().trim();
  for (const w of FORBIDDEN_WORDS_V6) {
    const rx = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (rx.test(lower)) return `forbidden word: "${w}"`;
  }
  // Must end with a V8 qualified mind-prep verb (allow trailing punctuation).
  const trailing = lower.replace(/[.!?\s]+$/, '');
  if (!ALLOWED_CTA_VERBS_V8.some(v => trailing.endsWith(v))) {
    return 'must end with a V8 qualified mind-prep CTA verb';
  }
  if (/\{[a-z_]+\}|\bN\b|--/i.test(body)) return 'placeholder token detected';
  // Meaning-first lint
  const meaningViolation = violatesMeaningSentence(body);
  if (meaningViolation) return meaningViolation;
  // Named-context lint
  if (!requiresNamedContextToken(body, ctx)) {
    return 'body cites no named context token (event title, metric+unit, count, time, or check-in word)';
  }
  const wordCount = body.trim().split(/\s+/).length;
  // v8 — meaning-forward bodies are longer than V7 metric-led bodies.
  // Gold-standard examples run 18–22 words.
  if (wordCount > 22) return `body too long (${wordCount} words, max 22)`;
  if (body.length > 140) return `body too long (${body.length} chars, max 140)`;
  return null;
}

// ══════════════════════════════════════════════════════════════
// ── AI Copy Generation ──
// ══════════════════════════════════════════════════════════════

async function generateNudgeCopy(
  ctx: NudgeContext,
  nudgeType: string,
  specificSignals: Record<string, unknown> = {}
): Promise<NudgeCopy | null> {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    console.warn('[smart-nudges] No ANTHROPIC_API_KEY – using static fallback');
    return null;
  }

  const systemPrompt = `You are the Chief of Staff for the Mind of a C-suite leader. You write push notifications for a MENTAL-PERFORMANCE app. The user's job, every time, is to OPEN THE APP and do MENTAL prep — never strategic prep, never deck prep.

EVERY notification is anchored to ONE of two things:
  • JIT  — a specific upcoming/just-past calendar event from the user's morning plan
  • STATE — a specific physiological / check-in / plan-progress signal from today
If neither anchor is present, do not write copy.

THE THREE V8 PRINCIPLES (non-negotiable):

1. LEAD WITH MEANING, NOT THE DATA POINT.
   Raw metrics never lead. The first sentence translates what the data MEANS for the user's day. The number, if used, sits INSIDE the meaning sentence (parenthetical or clause) — it never carries the message alone.
   ❌ "HRV -22% today — log in to prep."
   ✅ "Your body's running below baseline (HRV -22%). Close the day before tomorrow loads up — log in to recalibrate your mind."

2. TITLE = STATE OR MOMENT. BODY = CONTEXT + ONE CLEAR ACTION.
   Title names a moment a CEO recognises ("Recovery in progress", "Starting from where you are", "Recalibrating mid-day"). Body delivers the so-what plus a specific in-app action.

3. CTA ALWAYS ENDS AT A SPECIFIC APP SCREEN VIA A "log in / check in / open" VERB — AND THE PREP IS ALWAYS MENTAL.
   This is a mental-performance system. Plain "prep" is ambiguous (a CEO reads it as "prep the deck"). Every CTA must qualify the prep as MIND / STATE / RECALIBRATE / CLOSE / SET / LAND.

Allowed CTA verbs (verbatim end of body, modulo trailing punctuation):
  "log in to prep your mind"               (JIT plan exists)
  "log in to prep your mind tonight"       (Sunday/eve, high-stakes Monday)
  "log in to prep your state"              (JIT, depleted state)
  "log in to recalibrate your mind"        (evening recovery)
  "check in to recalibrate"                (mid-day reset)
  "check in to set your intention"         (morning anchor)
  "check in to set tomorrow"               (Sunday close)
  "check in to close the day"              (evening close)
  "check in to close the week"             (Friday close)
  "check in to land the weekend"           (Saturday)
  "open your insights"                     (pattern alerts only)

BANNED CTA verbs (never use, even if the user's data tempts you):
  "your prep is ready", "your plan is ready", "your brief is ready",
  "see your prep", "see your plan", "see your readiness", "tap to prep",
  "open the app to prep", "check into the app to prep", "go to the app to prep",
  "prep now", "open the app to prep tonight", "open the app to prep with a cool-down".
These either present the work as already done (passive consumption) or leave "prep" unqualified (CEO reads it as strategic prep).

Gold-standard examples (match these shapes — meaning-first, named context, qualified mind-prep CTA):
- Evening · 7 meetings:
  Title: "Evening cool-down"
  Body:  "Seven meetings, no real break for your mind today. Close the day before it carries into tomorrow — log in to recalibrate your mind."
- Evening · HRV deficit:
  Title: "Recovery in progress"
  Body:  "Your body's running below baseline (HRV -22%). Close the day with a short reset before tomorrow loads up — log in to recalibrate your mind."
- Morning · yesterday depleted + heavy day:
  Title: "Starting from where you are"
  Body:  "Yesterday was heavy and today has 5 meetings ahead. Manage your energy instead of reacting to it — check in to set your intention."
- Morning · JIT board in 60m:
  Title: "Preparing mental performance"
  Body:  "Board Review in an hour. Walk in with the edge, not the anxiety — log in to prep your mind."
- Afternoon · morning was low:
  Title: "Mid-day reset window"
  Body:  "Your morning state was low and the afternoon is still ahead. This is the recovery window — check in to recalibrate."
- Afternoon · 3 more meetings:
  Title: "Recalibrating mid-day"
  Body:  "Halfway through with three more meetings ahead. Stay sharp instead of running on fumes — check in to recalibrate."
- Pre-event · investor 60m, peak:
  Title: "You're ready for this"
  Body:  "Investor Update in an hour. Your mental prep is built for exactly this moment — log in to prep your mind."
- Pre-event · board 45m, depleted:
  Title: "Managing the moment"
  Body:  "Board Review in 45 minutes and you're running low. Short, sharp, built for right now — log in to prep your state."
- Friday close:
  Title: "Week complete"
  Body:  "Five heavy days behind you. Close the week before you disconnect so it doesn't bleed into the weekend — check in to close the week."
- Sunday · heavy Monday:
  Title: "Monday is already mapped"
  Body:  "Tomorrow opens with Board Review and a full calendar. Three minutes of clarity tonight beats two hours of catch-up — check in to set tomorrow."
- Sunday · high-stakes Monday event:
  Title: "Big Monday — pre-loading now"
  Body:  "Tomorrow opens with a high-stakes moment. Wake up ahead instead of behind — log in to prep your mind tonight."
- Saturday · low HRV:
  Title: "The body's still catching up"
  Body:  "Recovery from the week isn't instant — your HRV is still below baseline. A short check-in tells you what kind of weekend you actually need — check in to land the weekend."

Hard rules:
- Title: max 6 words, no emoji, names the state or moment in human language.
- Body: max 22 words AND 140 characters. One or two short sentences.
- Body MUST cite at least ONE named context token from the data block: a real event title, an HRV/RHR/sleep number with unit, a meetings/practices count, a minutes-until or clock time, or a check-in outcome word the user actually logged. Never invent a number or a meeting name.
- The first sentence MUST be a meaning sentence — never a bare metric like "HRV -22% today" or "RHR +9 bpm".
- The body MUST end with one of the V8 qualified mind-prep CTA verbs above (verbatim).
- When the JIT anchor is an event from the user's morning plan, prefix with "From your morning Plan:" or "From your plan:" — that prefix IS the proactive lure.
- Forbidden words/phrases: wellness, mindful, mindfulness, relax, breathe, calm, recharge, self-care, streak, "keep it up", "well done", "great job", productive, productivity, intent, strategy, strategic, "decision posture", "decision readiness", "mental sharpness", "anchor sharpness", "performance state", "reset trajectory", "capacity", "reserves", "baseline", "set the tone", "loaded day", "come back", and every banned CTA verb listed above.
- Truncate any event title longer than 20 characters to its first 3 words.
- Return ONLY valid JSON: {"title":"...","body":"..."}`;

  let userPrompt = '';
  const wearableLines = buildWearableLines(ctx);
  const wearablePriorityLines = buildWearablePriorityLines(ctx);

  switch (nudgeType) {
    case 'nudge_one_morning': {
      const firstEventRaw = (specificSignals.firstEventTitle as string | undefined) || ctx.firstNonNoiseEvent?.title;
      const firstEvent = firstEventRaw ? truncateEventTitle(firstEventRaw) : null;
      const firstEventTime = specificSignals.firstEventTime || (ctx.firstNonNoiseEvent ? new Date(ctx.firstNonNoiseEvent.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null);
      const stakes = ctx.highStakesEvents.map(e => truncateEventTitle(e.title)).filter(Boolean);
      const dayShapeLine = buildDayShapeLine(ctx);
      userPrompt = `Morning nudge (06:30–09:00 local). Prepare the leader for today.

Available signals (use ONLY these):
${firstEvent ? `- First event: ${firstEvent}${firstEventTime ? ` at ${firstEventTime}` : ''}` : '- First event: none scheduled'}
- Meetings today: ${ctx.eventCount}
${stakes.length > 0 ? `- High-stakes today: ${stakes.join(', ')}` : '- High-stakes today: none'}
${wearableLines ? wearableLines : '- Wearable: not available, DO NOT mention HRV, RHR, sleep, baselines'}
- Day: ${ctx.dayName}
${dayShapeLine}
${wearablePriorityLines ? wearablePriorityLines : ''}

Required CTA verb at end of body: "check in to set your intention" (default) or "log in to prep your state" (if HRV<-15% or sleep<60 with a heavy day) or "log in to prep your mind" (if naming a high-stakes event). The first sentence MUST be a meaning sentence — never a bare metric.`;
      break;
    }

    case 'nudge_one_jit': {
      const evt = specificSignals as { eventTitle: string; minutesUntil: number };
      const evtTitle = truncateEventTitle(evt.eventTitle);
      const hrvLine = ctx.hasWearableData && ctx.wearable.hrvDeltaPct !== null
        ? `\n- HRV: ${ctx.wearable.hrvDeltaPct}% vs baseline` : '';
      const dayShapeLine = buildDayShapeLine(ctx);
      userPrompt = `JIT first-touch. This event is from the user's MORNING PLAN — the prep plan is already queued.
The proactive job is to pull them back into the app to use that prep before the event starts.

Available signals:
- Event: "${evtTitle}" in ${evt.minutesUntil} minutes${hrvLine}
${ctx.morningCheckinOutcome ? `- Morning state: ${ctx.morningCheckinOutcome}` : ''}
- Meetings today: ${ctx.eventCount}
${dayShapeLine}

Required: name "${evtTitle}" + minutes-until. The first sentence is a meaning sentence ("Walk in with the edge, not the anxiety", "Lead it instead of surviving it") — not a bare metric.
Required CTA verb at end of body: "log in to prep your mind" (default) or "log in to prep your state" (if morning state was depleted/managing).`;
      break;
    }

    case 'nudge_two_jit': {
      const evt = specificSignals as { eventTitle: string; minutesUntil: number };
      const evtTitle = truncateEventTitle(evt.eventTitle);
      userPrompt = `Mid-day JIT. This event is from the user's MORNING PLAN — the prep plan is already queued.
Pull them back into the app. Their context may have shifted since morning, but the event hasn't.

Available signals:
- Event: "${evtTitle}" in ${evt.minutesUntil} minutes
${ctx.morningCheckinOutcome ? `- Morning state: ${ctx.morningCheckinOutcome}` : ''}
- Meetings today: ${ctx.eventCount}

Required: name "${evtTitle}" + minutes-until. The first sentence is a meaning sentence (e.g. "Stay sharp instead of running on fumes") — never a bare metric.
Required CTA verb at end of body: "log in to prep your mind" (default) or "log in to prep your state" (if depleted).`;
      break;
    }

    case 'nudge_two_priorities': {
      const remaining = specificSignals.remainingCount as number;
      userPrompt = `Mid-day. User has practices remaining on today's plan.

Available signals:
- Practices remaining: ${remaining}
- Meetings today: ${ctx.eventCount}

Required: name the count "${remaining} practice${remaining === 1 ? '' : 's'} left".
The first sentence translates what that means for the day, not the raw count alone.
Required CTA verb at end of body: "check in to recalibrate".
Say "practices" not "priorities". Never reference "Priority 1".`;
      break;
    }

    case 'nudge_two_recalibrate': {
      const eventTitle = truncateEventTitle(specificSignals.eventTitle as string);
      userPrompt = `State-aware recalibration. User started low; heavy afternoon ahead.

Available signals:
- Morning check-in: ${ctx.morningCheckinOutcome}
- Next event: "${eventTitle}"

Required: name the morning state AND the event in a meaning sentence (e.g. "Your morning state was low and ${eventTitle} is next — this is the recovery window").
Required CTA verb at end of body: "check in to recalibrate".`;
      break;
    }

    case 'nudge_two_reserves': {
      const evt = specificSignals as { eventTitle: string; signal: 'rhr' | 'hrv' };
      const evtTitle = truncateEventTitle(evt.eventTitle);
      const signalLine = evt.signal === 'rhr'
        ? `RHR elevated above baseline`
        : (ctx.wearable.hrvDeltaPct !== null ? `HRV ${ctx.wearable.hrvDeltaPct}% vs baseline` : null);
      // If we cannot cite a real number, hand off to fallback
      if (!signalLine) return null;
      userPrompt = `Reserves-down lure. Physiology is depleted with a high-stakes event ahead.

Available signals:
- Wearable: ${signalLine}
- Next high-stakes: "${evtTitle}"
${ctx.morningCheckinOutcome ? `- Morning check-in: ${ctx.morningCheckinOutcome}` : ''}

Required: cite the wearable signal INSIDE a meaning sentence (e.g. "You're running low (${signalLine}) and ${evtTitle} is next") — never lead with the bare metric.
Required CTA verb at end of body: "log in to prep your state" or "check in to recalibrate".`;
      break;
    }

    case 'nudge_three': {
      const isWeekendEvening = ctx.isWeekend || ctx.dayOfWeek === 5;
      const isSundayEvening = ctx.dayOfWeek === 0;
      const tomorrowHighStakes = ctx.tomorrowEvents.filter(e => isHighStakes(e.title)).map(e => ({ ...e, title: truncateEventTitle(e.title) }));
      const tomorrowEventCount = ctx.tomorrowEvents.filter(e => !isNoiseEvent(e.title || '')).length;

      const eveningWearableLines: string[] = [];
      if (ctx.hasWearableData) {
        if (ctx.wearable.hrvDeltaPct !== null) eveningWearableLines.push(`- HRV end of day vs baseline: ${ctx.wearable.hrvDeltaPct}%`);
        if (ctx.wearable.rhrElevated) eveningWearableLines.push(`- RHR: elevated through the day`);
      }

      const prioritiesCompleted = ctx.completedPracticeIds.length;
      const prioritiesTotal = ctx.completedPracticeIds.length + ctx.pendingPracticeIds.length;
      const prioritiesRemaining = ctx.pendingPracticeIds.length;
      const todayStakes = ctx.highStakesEvents.map(e => truncateEventTitle(e.title));

      userPrompt = `Evening nudge (18:00–21:00 local). Close today and set up tomorrow.

Available signals (use ONLY these):
- Meetings today: ${ctx.eventCount}
${todayStakes.length > 0 ? `- High-stakes today: ${todayStakes.join(', ')}` : ''}
- Practices: ${prioritiesCompleted}/${prioritiesTotal} done${prioritiesRemaining > 0 ? `, ${prioritiesRemaining} still open` : ''}
${eveningWearableLines.length > 0 ? eveningWearableLines.join('\n') : '- Wearable: not available, DO NOT mention HRV, RHR, sleep'}
${isSundayEvening ? `- Tomorrow (Mon): ${tomorrowEventCount} meetings${tomorrowHighStakes.length > 0 ? `, incl. "${tomorrowHighStakes[0].title}"` : ''}` : ''}

${isSundayEvening ? `SUNDAY framing: name a Monday signal, prepare the user for the week. Required CTA verb at end of body: "check in to set tomorrow" (default) or "log in to prep your mind tonight" (if a high-stakes Monday event).` : ''}
${ctx.dayOfWeek === 5 ? `FRIDAY framing: name today's load (meetings count or high-stakes) inside a meaning sentence. Required CTA verb at end of body: "check in to close the week".` : ''}
${!isSundayEvening && ctx.dayOfWeek !== 5 && ctx.dayOfWeek !== 6 ? `Required CTA verb at end of body: "log in to recalibrate your mind" (if HRV/RHR signal) or "check in to close the day" (default).` : ''}
${ctx.dayOfWeek === 6 ? `SATURDAY framing: recovery-first. Required CTA verb at end of body: "check in to land the weekend".` : ''}`;
      break;
    }

    // Legacy types for backward compat
    case 'morning_prep':
    case 'jit_pre_event':
    case 'calendar_gap':
    case 'coach_meeting_match':
    case 'performance_state':
    case 'evening_close':
    case 'pattern_alert':
    case 'daily_fallback':
      return null; // Post-MVP types should use fallback

    default:
      return null;
  }

  // Try providers in order: Claude Haiku → Lovable AI Gemini Flash → null.
  // Both providers are validated through the identical V8 gate.
  const claudeCopy = await tryAIProvider('claude', ctx, nudgeType, systemPrompt, userPrompt);
  if (claudeCopy) return claudeCopy;
  const geminiCopy = await tryAIProvider('gemini', ctx, nudgeType, systemPrompt, userPrompt);
  if (geminiCopy) return geminiCopy;
  return null;
}

// V8 — shared real-context tokens for requiresNamedContextToken().
function buildV8CtxForCheck(ctx: NudgeContext): { eventTitles: string[]; checkinWord: string | null } {
  return {
    eventTitles: [
      ...ctx.todayEvents.map(e => e.title || ''),
      ...ctx.tomorrowEvents.map(e => e.title || ''),
      ...ctx.highStakesEvents.map(e => e.title || ''),
      ctx.firstNonNoiseEvent?.title || '',
    ].filter(Boolean),
    checkinWord: ctx.morningCheckinOutcome ?? null,
  };
}

function isLowContextStaticFallbackVariant(variantId: string): boolean {
  // Strip A/B CTA arm suffix (e.g. "FB-N3-light::D") before checking,
  // because applyCtaVariant mutates variantId after the pre-AB validator runs.
  return variantId.replace(/::[ABCD]$/, '').endsWith('-light');
}

function isNamedContextViolation(violation: string): boolean {
  return violation.includes('no named context token');
}

// V8 — validate any static fallback copy through the same contract used for
// AI output. If the fallback violates V8, we drop it so the cron tick simply
// sends nothing rather than ship V7 phrasing.
function validateStaticFallbackCopy(
  copy: NudgeCopy | null,
  ctx: NudgeContext,
  nudgeType: string,
): NudgeCopy | null {
  if (!copy) return null;
  const v8Ctx = buildV8CtxForCheck(ctx);
  const violation = violatesCopyContractV8(copy.body, v8Ctx);
  if (violation && !(isLowContextStaticFallbackVariant(copy.variantId) && isNamedContextViolation(violation))) {
    console.warn(
      `[smart-nudges v8] Suppressed static fallback ${copy.variantId} for ${nudgeType}: ${violation} | "${copy.body}"`,
    );
    return null;
  }
  if (violation) {
    console.log(
      `[smart-nudges v8] Allowed low-context static fallback ${copy.variantId} for ${nudgeType}: ${violation}`,
    );
  }
  // V8 telemetry — stamp the provider so the insert payload can record
  // which path actually produced the shipped copy (claude / gemini / static).
  return { ...copy, aiProvider: 'static' };
}

async function tryAIProvider(
  provider: 'claude' | 'gemini',
  ctx: NudgeContext,
  nudgeType: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<NudgeCopy | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    let content = '';
    if (provider === 'claude') {
      content = await callClaudeText({
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        model: CLAUDE_MODELS.HAIKU,
        max_tokens: 256,
        temperature: 0.7,
        signal: controller.signal,
      });
    } else {
      content = await callLovableAIText({
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        model: 'google/gemini-3-flash-preview',
        max_tokens: 256,
        temperature: 0.7,
        signal: controller.signal,
      });
    }

    clearTimeout(timeout);
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed?.title || !parsed?.body) return null;

    if (containsFabricatedWearableData(parsed.body, ctx.hasWearableData)) {
      console.warn(`[smart-nudges ${provider}] Rejected AI copy for ${nudgeType}, fabricated wearable data: "${parsed.body}"`);
      return null;
    }
    const lowerBody = (parsed.body as string).toLowerCase();
    if (ctx.wearable.hrvDeltaPct === null && /hrv|heart rate variability/.test(lowerBody)) {
      console.warn(`[smart-nudges ${provider}] Rejected for ${nudgeType}, cites HRV but null`);
      return null;
    }
    if (!ctx.wearable.rhrElevated && ctx.wearable.hrvDeltaPct === null && /rhr|resting heart rate/.test(lowerBody)) {
      console.warn(`[smart-nudges ${provider}] Rejected for ${nudgeType}, cites RHR but no signal`);
      return null;
    }
    if (ctx.wearable.sleepScore === null && /sleep score|slept/.test(lowerBody)) {
      console.warn(`[smart-nudges ${provider}] Rejected for ${nudgeType}, cites sleep but null`);
      return null;
    }

    const violation = violatesCopyContractV8(parsed.body, buildV8CtxForCheck(ctx));
    if (violation) {
      console.warn(`[smart-nudges v8 ${provider}] Rejected for ${nudgeType}: ${violation} | "${parsed.body}"`);
      return null;
    }

    return {
      title: parsed.title.substring(0, 60),
      body: parsed.body.substring(0, 140),
      variantId: `AI-${provider}-${nudgeType}-${Date.now()}`,
      aiProvider: provider,
    };
  } catch (e) {
    console.warn(`[smart-nudges ${provider}] AI copy error:`, e instanceof Error ? e.message : e);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// ── Static Fallback Copy — MVP Nudge System ──
// ══════════════════════════════════════════════════════════════

function getFallbackNudgeOneMorningCopy(ctx: NudgeContext): NudgeCopy {
  // v8 — Meaning-first sentence + named context + qualified mind-prep CTA.
  const dc = ctx.dayContext;

  // V8 — Out-of-office / away-day morning (weekday or weekend, no meeting needed)
  if (dc.kind === 'ooo' || dc.kind === 'away-day') {
    return {
      title: 'Day away',
      body: `On your day away — a short reset before you switch off. Check in to set your intention.`,
      variantId: 'FB-N1-away',
    };
  }

  // V8 — Travel today (state-anchored, no meeting required)
  if (dc.kind === 'travel-day') {
    return {
      title: 'Travel today',
      body: `Travel on today's calendar. Ground yourself before the day moves — check in to set your intention.`,
      variantId: 'FB-N1-travel',
    };
  }

  // V8 — Post-travel morning (yesterday included travel), STATE-only, no JIT
  if (dc.postTravel) {
    return {
      title: 'Recovery context',
      body: `Yesterday included travel — body may still be carrying load. Log in to prep your state.`,
      variantId: 'FB-N1-post-travel',
    };
  }

  if (ctx.hasWearableData && ctx.wearable.sleepScore !== null && ctx.wearable.sleepScore < 60) {
    return {
      title: 'Short sleep last night',
      body: `Last night was light on recovery (Sleep ${ctx.wearable.sleepScore}/100). Today still needs you sharp — log in to prep your state.`,
      variantId: 'FB-N1-recovery',
    };
  }
  if (ctx.hasWearableData && ctx.wearable.hrvDeltaPct !== null && ctx.wearable.hrvDeltaPct < -15) {
    return {
      title: 'Starting from where you are',
      body: `Your body is running below baseline (HRV ${ctx.wearable.hrvDeltaPct}%) and ${ctx.eventCount} meeting${ctx.eventCount === 1 ? '' : 's'} sit ahead. Manage the day rather than react to it — check in to set your intention.`,
      variantId: 'FB-N1-hrv',
    };
  }
  if (ctx.highStakesEvents.length > 0) {
    const ev = truncateEventTitle(ctx.highStakesEvents[0].title || 'high-stakes meeting');
    return {
      title: 'Preparing mental performance',
      body: `${ev} on the calendar today. Walk in with the edge, not the anxiety — log in to prep your mind.`,
      variantId: 'FB-N1-stakes',
    };
  }
  if (ctx.dayType === 'heavy' || ctx.dayType === 'extreme') {
    return {
      title: 'Starting from where you are',
      body: `${ctx.eventCount} meetings ahead today. Manage your energy instead of reacting to it — check in to set your intention.`,
      variantId: 'FB-N1-heavy',
    };
  }
  if (ctx.dayOfWeek === 6) {
    // V8 — Saturday AM with a meeting: anchored Saturday tone.
    if (ctx.firstNonNoiseEvent) {
      const ev = truncateEventTitle(ctx.firstNonNoiseEvent.title || 'today\'s meeting');
      return {
        title: 'Saturday with one to land',
        body: `${ev} on the calendar today. Land your mind before it arrives — check in to set your intention.`,
        variantId: 'FB-N1-sat-anchored',
      };
    }
    // V8 — Saturday AM no meeting: recovery/reset, sets tone for the weekend.
    return {
      title: 'Saturday recovery',
      body: `No meetings today — a short reset shapes the kind of weekend you actually need. Check in to set your intention.`,
      variantId: 'FB-N1-sat-recovery',
    };
  }

  // V8 — Sunday AM habit: recovery/reset before the week forms.
  if (ctx.dayOfWeek === 0) {
    if (ctx.firstNonNoiseEvent) {
      const ev = truncateEventTitle(ctx.firstNonNoiseEvent.title);
      return {
        title: 'Sunday reset',
        body: `${ev} on the calendar today. A short reset before the day forms — check in to set your intention.`,
        variantId: 'FB-N1-sun-anchored',
      };
    }
    return {
      title: 'Sunday reset',
      body: `Quiet Sunday on the calendar — a short reset lands you before the week forms. Check in to set your intention.`,
      variantId: 'FB-N1-sun-reset',
    };
  }
  if (ctx.eventCount > 0) {
    const m = `${ctx.eventCount} meeting${ctx.eventCount > 1 ? 's' : ''}`;
    return {
      title: 'Setting the day',
      body: `${m} ahead today. Three minutes of clarity now beats reacting to the calendar — check in to set your intention.`,
      variantId: 'FB-N1-calendar',
    };
  }
  return {
    title: 'Room to breathe today',
    body: `Only ${ctx.eventCount} meeting${ctx.eventCount === 1 ? '' : 's'} on the calendar today gives you the rare chance to choose what your mind owns. Use the space — check in to set your intention.`,
    variantId: 'FB-N1-light',
  };
}

function getFallbackNudgeOneJitCopy(eventTitle: string, minutesUntil: number): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  return {
    title: 'Preparing mental performance',
    body: `From your morning Plan: ${ev} in ${minutesUntil} min. Walk in with the edge, not the anxiety — log in to prep your mind.`,
    variantId: 'FB-N1-JIT',
  };
}

// V8 — Post-travel JIT variant: lead with travel-recovery awareness, then JIT, then CTA.
function getFallbackNudgeOneJitPostTravelCopy(eventTitle: string, minutesUntil: number): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  return {
    title: 'Preparing mental performance',
    body: `From your morning Plan: ${ev} in ${minutesUntil} min. Yesterday included travel — log in to prep your mind.`,
    variantId: 'FB-N1-JIT-post-travel',
  };
}

function getFallbackNudgeTwoJitCopy(eventTitle: string, minutesUntil: number): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  if (minutesUntil <= 120) {
    return {
      title: 'Preparing mental performance',
      body: `From your plan: ${ev} in ${minutesUntil} min. Walk in sharp — log in to prep your mind.`,
      variantId: 'FB-N2-JIT-soon',
    };
  }
  const eventTime = new Date(Date.now() + minutesUntil * 60000);
  const timeStr = eventTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return {
    title: 'Preparing mental performance',
    body: `From your plan: ${ev} at ${timeStr}. Front-load the prep instead of scrambling later — log in to prep your mind.`,
    variantId: 'FB-N2-JIT-later',
  };
}

function getFallbackNudgeTwoPrioritiesCopy(remaining: number, _priorityTitle: string): NudgeCopy {
  const p = `${remaining} practice${remaining > 1 ? 's' : ''}`;
  return {
    title: 'Recalibrating mid-day',
    body: `${p} still open on today's plan. Stay sharp instead of running on fumes — check in to recalibrate.`,
    variantId: 'FB-N2-priorities',
  };
}

function getFallbackNudgeTwoRecalibrateCopy(eventTitle: string): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  return {
    title: 'Mid-day reset window',
    body: `Your morning state was low and ${ev} is next. This is the recovery window — check in to recalibrate.`,
    variantId: 'FB-N2-recal',
  };
}

function getFallbackNudgeTwoReservesCopy(nextEventTitle: string, signal: 'rhr' | 'hrv'): NudgeCopy {
  const ev = truncateEventTitle(nextEventTitle);
  if (signal === 'rhr') {
    return {
      title: 'Managing the moment',
      body: `You're running warm (RHR elevated) and ${ev} is next. Short, sharp, built for right now — log in to prep your state.`,
      variantId: 'FB-N2-reserves-rhr',
    };
  }
  return {
    title: 'Managing the moment',
    body: `You're running low (HRV below baseline) and ${ev} is next. Short, sharp, built for right now — log in to prep your state.`,
    variantId: 'FB-N2-reserves-hrv',
  };
}

function getFallbackNudgeTwoConsecutiveLowCopy(daysLow: number): NudgeCopy {
  return {
    title: 'Recovery deficit detected',
    body: `Your body's been under-recovering for ${daysLow} days. That's a load signal, not a weakness — log in to recalibrate your mind.`,
    variantId: 'FB-N2-consec-low',
  };
}

// ── v5.3 — Travel arc + look-ahead fallback copy ──
// Self-sufficient bodies (the in-flight one names the protocol so the user
// can still act if they have no Wi-Fi). All comply with the V8 qualified
// mind-prep CTA contract.
function getFallbackNudgeOnePreFlightCopy(eventTitle: string, minutesUntil: number): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  return {
    title: 'Travel ahead',
    body: `${ev} in ~${minutesUntil} min. Two minutes of paced breathing now keeps the body out of debt before takeoff — log in to prep your state.`,
    variantId: 'nudge_one_pre_flight',
  };
}

function getFallbackNudgeTwoInFlightCopy(eventTitle: string): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  return {
    title: 'Mid-air reset',
    body: `You're in the air on ${ev}. A short breath protocol now blunts the jet-lag tax — open in the app, or run it yourself: 4-in / 6-out for 2 minutes.`,
    variantId: 'nudge_two_in_flight',
  };
}

function getFallbackNudgeOnePostArrivalCopy(): NudgeCopy {
  return {
    title: 'Recovery context',
    body: `Yesterday included travel — body may still be carrying load. Settle in first — check in to recalibrate.`,
    variantId: 'nudge_one_post_arrival',
  };
}

function getFallbackNudgeThreeLookaheadCopy(tomorrowEventTitle: string): NudgeCopy {
  const ev = truncateEventTitle(tomorrowEventTitle);
  return {
    title: 'Tomorrow forms tonight',
    body: `${ev} on tomorrow's calendar. A clean close tonight is half the prep — log in to prep your mind tonight.`,
    variantId: 'nudge_three_lookahead',
  };
}

function getFallbackNudgeThreeCopy(ctx: NudgeContext): NudgeCopy {
  const prioritiesRemaining = ctx.pendingPracticeIds.length;
  const prioritiesTotal = ctx.completedPracticeIds.length + ctx.pendingPracticeIds.length;

  if (ctx.dayOfWeek === 0) {
    const tomorrowCount = ctx.tomorrowEvents.filter(e => !isNoiseEvent(e.title || '')).length;
    const tomorrowStakes = ctx.tomorrowEvents.filter(e => isHighStakes(e.title));
    if (tomorrowStakes.length > 0) {
      const ev = truncateEventTitle(tomorrowStakes[0].title);
      return {
        title: 'Big Monday — pre-loading now',
        body: `Tomorrow opens with ${ev}. Wake up ahead instead of behind — log in to prep your mind tonight.`,
        variantId: 'FB-N3-sun-stakes',
      };
    }
    if (tomorrowCount >= 4) {
      return {
        title: 'Monday is already mapped',
        body: `Tomorrow opens with ${tomorrowCount} meetings. Three minutes of clarity tonight beats two hours of catch-up — check in to set tomorrow.`,
        variantId: 'FB-N3-sun-heavy',
      };
    }
    return {
      title: 'Carrying the right things into Monday',
      body: `Light Monday ahead — ${tomorrowCount} meeting${tomorrowCount === 1 ? '' : 's'} on the calendar. Decide what you're bringing in — check in to set tomorrow.`,
      variantId: 'FB-N3-sun-default',
    };
  }

  if (ctx.dayOfWeek === 5) {
    if (ctx.eventCount > 0) {
      return {
        title: 'Week complete',
        body: `${ctx.eventCount} meetings behind you this week. Close the week before it bleeds into the weekend — check in to close the week.`,
        variantId: 'FB-N3-fri',
      };
    }
    return {
      title: 'Week complete',
      body: `Five days of leadership behind you this week. Close the week cleanly so it doesn't bleed into the weekend — check in to close the week.`,
      variantId: 'FB-N3-fri-light',
    };
  }

  if (ctx.dayOfWeek === 6) {
    return {
      title: 'The body\'s still catching up',
      body: `Recovery from the week isn't instant — even on Saturday. A short check-in tells you what kind of weekend you actually need — check in to land the weekend.`,
      variantId: 'FB-N3-sat',
    };
  }

  if (prioritiesRemaining > 0) {
    const p = `${prioritiesRemaining} practice${prioritiesRemaining > 1 ? 's' : ''}`;
    return {
      title: 'Closing strong',
      body: `${p} still open on today's plan and the day is winding down. Land the close before tomorrow loads up — check in to close the day.`,
      variantId: 'FB-N3-priorities',
    };
  }
  if (prioritiesTotal > 0 && prioritiesRemaining === 0) {
    return {
      title: 'Closing strong',
      body: `${prioritiesTotal} practice${prioritiesTotal === 1 ? '' : 's'} done today. Land it cleanly so tomorrow opens fresh — check in to close the day.`,
      variantId: 'FB-N3-done',
    };
  }

  if (ctx.hasWearableData && ctx.wearable.rhrElevated) {
    return {
      title: 'Recovery in progress',
      body: `Your body ran warm today (RHR elevated). Close the day with a short reset before tomorrow loads up — log in to recalibrate your mind.`,
      variantId: 'FB-N3-rhr',
    };
  }
  if (ctx.eventCount >= 6) {
    return {
      title: 'Evening cool-down',
      body: `${ctx.eventCount} meetings, no real break for your mind today. Close the day before it carries into tomorrow — log in to recalibrate your mind.`,
      variantId: 'FB-N3-heavy',
    };
  }
  if (ctx.eventCount > 0) {
    const m = `${ctx.eventCount} meeting${ctx.eventCount > 1 ? 's' : ''}`;
    return {
      title: 'Closing the day',
      body: `${m} behind you today. Close cleanly so tomorrow opens fresh — check in to close the day.`,
      variantId: 'FB-N3-default',
    };
  }
  return {
    title: 'Closing the day',
    body: `Quiet day on the calendar today, but tomorrow still benefits from a clean close tonight — check in to close the day.`,
    variantId: 'FB-N3-light',
  };
}

// ══════════════════════════════════════════════════════════════
// ── MVP Nudge Evaluators (Nudge 1, 2, 3) ──
// ══════════════════════════════════════════════════════════════

/**
 * NUDGE 1, First Touch (earliest relevant moment)
 * 
 * Priority order:
 * A) JIT morning event (high-stakes < 2h away) → /executive-home
 * B) Loaded day (3+ meetings, first event < 2h) → /daily-check-in
 * C) Light day → /daily-check-in
 * 
 * Calendar-aware timing: adapts window to first meeting start.
 * Gate: No morning check-in yet (or no JIT plan started).
 */
async function evaluateNudgeOne(
  ctx: NudgeContext,
  alreadySentTypes: Set<string>,
  sentEventRefs: Set<string>,
  supabase: ReturnType<typeof createClient>
): Promise<QualifiedNudge | null> {
  if (alreadySentTypes.has('nudge_one') || alreadySentTypes.has('morning_prep')) return null;

  // ── v5.3 — Travel arc: pre-flight rides the morning slot ──
  if (ctx.dayContext.preFlight) {
    const pf = ctx.dayContext.preFlight;
    const copy = validateStaticFallbackCopy(
      getFallbackNudgeOnePreFlightCopy(pf.eventTitle, pf.minutesUntil),
      ctx, 'nudge_one_morning',
    );
    if (copy) {
      return {
        type: 'nudge_one',
        copy,
        deepLinkRoute: '/recalibrate',
        priority: 0,
        anchorKind: 'state',
        slot: 'morning',
        signalStrength: 3,
      };
    }
  }

  // ── v5.3 — Post-arrival recovery rides the morning slot ──
  if (ctx.dayContext.postTravel && ctx.morningCheckinOutcome === null) {
    const copy = validateStaticFallbackCopy(
      getFallbackNudgeOnePostArrivalCopy(),
      ctx, 'nudge_one_morning',
    );
    if (copy) {
      return {
        type: 'nudge_one',
        copy,
        deepLinkRoute: '/daily-check-in',
        priority: 0,
        anchorKind: 'state',
        slot: 'morning',
        signalStrength: 2,
      };
    }
  }

  // ── v5.3 — PTO / public-holiday "light touch": single morning nudge,
  // skip JIT pre-event prep entirely. Falls through to morning anchor.
  const ptoMode = ctx.dayContext.ptoMode === true;

  // V8 weekend morning policy:
  // - Saturday AM with a meeting: fire calendar-anchored (slower entry, Saturday tone).
  // - Saturday AM no meeting: fire recovery/reset state-anchored nudge (09:00–10:30).
  // - Sunday AM: always fire recovery/reset habit nudge (08:00–10:30 if no meeting,
  //   calendar-anchored if a meeting exists).

  // ── A) JIT morning event — check first ──
  // v5: drop the jit_horizons_surfaced requirement so the lure fires on
  // any high-stakes event detected by the JIT scoring layer.
  if (ctx.morningCheckinOutcome === null || ctx.jitEvents.length > 0) {
    if (ptoMode) {
      // PTO: never fire JIT pre-event prep on a day off.
    } else
    for (const evt of ctx.jitEvents) {
      if (evt.confidenceBand === 'none') continue;
      if (sentEventRefs.has(evt.externalId)) continue;

      const minutesUntil = Math.round((new Date(evt.eventStart).getTime() - Date.now()) / 60000);
      if (minutesUntil < 30 || minutesUntil > 180) continue; // 30 min – 3 h window

      // v5: only require the JIT context row not be dismissed; do NOT
      // require horizons to be precomputed (that gate killed almost all
      // JIT lures in production for 7 days running).
      const { data: jitPlan } = await supabase
        .from('jit_event_context')
        .select('id')
        .eq('user_id', ctx.userId)
        .eq('id', evt.eventId)
        .eq('dismissed_by_user', false)
        .limit(1);
      if (!jitPlan || jitPlan.length === 0) continue;

      // ── v5.3 — JIT silence when prep is already consumed ──
      // If today's plan ledger marks a matching priority as completed,
      // skip — the user has already done the work.
      const { data: ledgerRows } = await supabase
        .from('daily_ritual_completions')
        .select('plan_ledger')
        .eq('user_id', ctx.userId)
        .eq('ritual_date', ctx.todayStr);
      const ledger = (ledgerRows || []).flatMap((r: any) => (r.plan_ledger as any[]) || []);
      const evtBucket = (evt.eventTitle || '').toLowerCase();
      const prepDone = ledger.some((p: any) => {
        const status = String(p?.status || '').toLowerCase();
        const ref = String(p?.event_reference || '').toLowerCase();
        const title = String(p?.title || '').toLowerCase();
        return status === 'completed' && (ref === evt.externalId.toLowerCase() ||
          (evtBucket && (ref.includes(evtBucket) || title.includes(evtBucket))));
      });
      if (prepDone) {
        console.log(`[smart-nudges][v5.3] JIT silenced (prep_already_done) user=${ctx.userId} event=${evt.externalId}`);
        continue;
      }

      const aiCopy = await generateNudgeCopy(ctx, 'nudge_one_jit', {
        eventTitle: evt.eventTitle || 'Upcoming event',
        minutesUntil,
      });
      const copy = aiCopy || validateStaticFallbackCopy(
        ctx.dayContext.postTravel
          ? getFallbackNudgeOneJitPostTravelCopy(evt.eventTitle || 'Upcoming event', minutesUntil)
          : getFallbackNudgeOneJitCopy(evt.eventTitle || 'Upcoming event', minutesUntil),
        ctx, 'nudge_one_jit',
      );
      if (!copy) continue;

      // Route by check-in state — if user hasn't done check-in yet, send
      // them to the brief; otherwise send them to the queued plan.
      const route = ctx.morningCheckinOutcome === null ? '/daily-check-in' : '/executive-home';

      // v7 — pattern-cited JIT outranks plain JIT in the comparator.
      const pat = findEventPattern(ctx.pattern, evt.eventTitle);
      const sigStrength = pat ? 3 : 2;

      return {
        type: 'nudge_one',
        copy,
        deepLinkRoute: route,
        eventReference: evt.externalId,
        priority: 0,
        anchorKind: 'jit',
        slot: 'morning',
        signalStrength: sigStrength,
      };
    }
  }

  // ── B & C) Morning check-in (loaded vs light day) ──
  if (ctx.morningCheckinOutcome !== null) return null; // Already checked in

  // v5 — calendar-anchored morning timing
  // Hard floor: 08:00 local. If a first meeting exists, we anchor 60–90 min
  // before but never earlier than 08:00. If no first meeting, 08:00–09:30.
  let morningStart = GLOBAL_EARLIEST_LOCAL;
  let morningEnd = 9.5;

  if (ctx.firstNonNoiseEvent) {
    const eventTime = new Date(ctx.firstNonNoiseEvent.start_time);
    const eventHour = eventTime.getHours() + eventTime.getMinutes() / 60;
    const title = (ctx.firstNonNoiseEvent.title || '').toLowerCase();
    const isVirtual = title.includes('zoom') || title.includes('teams') || title.includes('call') || title.includes('video') || title.includes('virtual');
    // 60 min before virtual, 90 min before in-person
    const leadHours = isVirtual ? 1.0 : 1.5;
    const idealStart = eventHour - leadHours;
    morningStart = Math.max(GLOBAL_EARLIEST_LOCAL, Math.min(idealStart, 10.0));
    morningEnd = Math.max(morningStart + 1.0, eventHour - 0.25); // close window 15 min before meeting
  }

  // Saturday: when a meeting exists, push start later (slower entry)
  if (ctx.dayOfWeek === 6) {
    morningStart = Math.max(morningStart, 9.0);
    morningEnd = Math.max(morningEnd, 11.0);
  }

  // V8 — Sunday AM, or Saturday AM with no meeting: 09:00–10:30 local recovery window
  // (users may sleep in on weekends).
  if (ctx.dayOfWeek === 0 || (ctx.dayOfWeek === 6 && !ctx.firstNonNoiseEvent)) {
    morningStart = 9.0;
    morningEnd = 10.5;
  }

  if (ctx.localTime < morningStart || ctx.localTime >= morningEnd) return null;

  // Don't fire if first event is < 30 min away (we already missed the window)
  if (ctx.firstNonNoiseEvent) {
    const minutesUntil = (new Date(ctx.firstNonNoiseEvent.start_time).getTime() - Date.now()) / 60000;
    if (minutesUntil < 30) return null;
  }

  const aiCopy = await generateNudgeCopy(ctx, 'nudge_one_morning');
  const copy = aiCopy || validateStaticFallbackCopy(getFallbackNudgeOneMorningCopy(ctx), ctx, 'nudge_one_morning');
  if (!copy) return null;

  return {
    type: 'nudge_one',
    copy,
    deepLinkRoute: '/daily-check-in',
    priority: 0,
    anchorKind: 'state',
    slot: 'morning',
    signalStrength: ctx.hasWearableData ? 2 : 1,
  };
}

/**
 * NUDGE 2, Mid-day Action (plan-driven)
 * 
 * Priority order:
 * A) JIT event approaching (30-360 min) → /executive-home
 * B) Priorities incomplete (afternoon) → /executive-home
 * C) State-aware recalibrate (low morning + heavy PM) → /daily-check-in
 * 
 * Window: 9:30-16:00
 * Gate: Plan must exist (priorities generated or JIT plan)
 */
async function evaluateNudgeTwo(
  ctx: NudgeContext,
  alreadySentTypes: Set<string>,
  sentEventRefs: Set<string>,
  supabase: ReturnType<typeof createClient>
): Promise<QualifiedNudge | null> {
  if (alreadySentTypes.has('nudge_two') || alreadySentTypes.has('pre_event_prep')) return null;
  if (ctx.localTime < GLOBAL_EARLIEST_LOCAL || ctx.localTime >= 16) return null;

  // ── v5.3 — In-flight reset rides the mid-day slot ──
  if (ctx.dayContext.inFlight) {
    const ifl = ctx.dayContext.inFlight;
    const copy = validateStaticFallbackCopy(
      getFallbackNudgeTwoInFlightCopy(ifl.eventTitle),
      ctx, 'nudge_two_recalibrate',
    );
    if (copy) {
      return {
        type: 'nudge_two',
        copy,
        deepLinkRoute: '/recalibrate',
        priority: 1,
        anchorKind: 'state',
        slot: 'afternoon',
        signalStrength: 3,
      };
    }
  }

  // ── v5.3 — PTO collapse: no mid-day or JIT on PTO days ──
  if (ctx.dayContext.ptoMode) return null;

  // ── A) JIT event approaching ──
  for (const evt of ctx.jitEvents) {
    if (evt.confidenceBand === 'none') continue;
    if (sentEventRefs.has(evt.externalId)) continue;

    const minutesUntil = Math.round((new Date(evt.eventStart).getTime() - Date.now()) / 60000);
    // v5 — focus on the 30 min – 3 h pre-event window
    if (minutesUntil < 30 || minutesUntil > 180) continue;

    // v5 — drop horizons-surfaced gate (was killing all JIT lures in prod)
    const { data: jitPlan } = await supabase
      .from('jit_event_context')
      .select('id')
      .eq('user_id', ctx.userId)
      .eq('id', evt.eventId)
      .eq('dismissed_by_user', false)
      .limit(1);
    if (!jitPlan || jitPlan.length === 0) continue;

    const aiCopy = await generateNudgeCopy(ctx, 'nudge_two_jit', {
      eventTitle: evt.eventTitle || 'Upcoming event',
      minutesUntil,
    });
    const copy = aiCopy || validateStaticFallbackCopy(
      getFallbackNudgeTwoJitCopy(evt.eventTitle || 'Upcoming event', minutesUntil),
      ctx, 'nudge_two_jit',
    );
    if (!copy) continue;

    // v5 smart routing — brief if check-in pending, plan if check-in done
    const checkedInToday = ctx.morningCheckinOutcome !== null || ctx.afternoonCheckinOutcome !== null;
    const route = checkedInToday ? '/executive-home' : '/daily-check-in';

    const pat = findEventPattern(ctx.pattern, evt.eventTitle);
    const sigStrength = pat ? 3 : 2;

    return {
      type: 'nudge_two',
      copy,
      deepLinkRoute: route,
      eventReference: evt.externalId,
      priority: 1,
      anchorKind: 'jit',
      slot: 'afternoon',
      signalStrength: sigStrength,
    };
  }

  // ── A2) Wearable-state lure (v5 NEW) ──
  // Reserves are down + a high-stakes event remains today + user hasn't
  // opened the app recently → invite into the brief to recalibrate.
  if (ctx.hasWearableData) {
    const reservesDown =
      ctx.wearable.rhrElevated ||
      (ctx.wearable.hrvDeltaPct !== null && ctx.wearable.hrvDeltaPct < -15);
    const upcomingHighStakes = ctx.highStakesEvents.filter(
      e => new Date(e.start_time).getTime() > Date.now(),
    );
    const recentlyOpened = ctx.lastAppOpen && (Date.now() - ctx.lastAppOpen.getTime()) < 4 * 60 * 60 * 1000;
    if (reservesDown && upcomingHighStakes.length > 0 && !recentlyOpened) {
      const evTitle = upcomingHighStakes[0].title || 'your next high-stakes meeting';
      const signal: 'rhr' | 'hrv' = ctx.wearable.rhrElevated ? 'rhr' : 'hrv';
      const aiCopy = await generateNudgeCopy(ctx, 'nudge_two_reserves', { eventTitle: evTitle, signal });
      const copy = aiCopy || validateStaticFallbackCopy(
        getFallbackNudgeTwoReservesCopy(evTitle, signal),
        ctx, 'nudge_two_reserves',
      );
      if (!copy) {
        // No compliant copy available; skip this lure rather than send V7 phrasing.
      } else {
      return {
        type: 'nudge_two',
        copy,
        deepLinkRoute: '/daily-check-in',
        priority: 1,
        anchorKind: 'state',
        slot: 'afternoon',
        signalStrength: 2,
      };
      }
    }
  }

  // ── B) Priorities incomplete (afternoon, 13:00+) — v7 LEGACY GENERIC ──
  // Suppressed by default; framework retained behind LEGACY_GENERIC_NUDGES_ENABLED.
  if (LEGACY_GENERIC_NUDGES_ENABLED && ctx.localTime >= 13 && ctx.pendingPracticeIds.length > 0) {
    const priorityTitle = 'Priority 1'; // Generic, we don't have practice names in context
    const remaining = ctx.pendingPracticeIds.length;

    const aiCopy = await generateNudgeCopy(ctx, 'nudge_two_priorities', {
      remainingCount: remaining,
      priorityTitle,
    });
    const copy = aiCopy || validateStaticFallbackCopy(
      getFallbackNudgeTwoPrioritiesCopy(remaining, priorityTitle),
      ctx, 'nudge_two_priorities',
    );
    if (!copy) return null;

    return {
      type: 'nudge_two',
      copy,
      deepLinkRoute: '/executive-home',
      priority: 1,
      anchorKind: 'state',
      slot: 'afternoon',
      signalStrength: 1,
    };
  }

  // ── C) State-aware recalibrate (low morning + heavy afternoon) ──
  if (!ctx.isWeekend && ctx.morningCheckinOutcome && LOW_TIERS.includes(ctx.morningCheckinOutcome)) {
    const afternoonHighStakes = ctx.highStakesEvents.filter(e => {
      const hour = new Date(e.start_time).getHours();
      return hour >= 12;
    });

    if (afternoonHighStakes.length > 0) {
      const eventTitle = afternoonHighStakes[0].title || 'your next meeting';
      const aiCopy = await generateNudgeCopy(ctx, 'nudge_two_recalibrate', { eventTitle });
      const copy = aiCopy || validateStaticFallbackCopy(
        getFallbackNudgeTwoRecalibrateCopy(eventTitle),
        ctx, 'nudge_two_recalibrate',
      );
      if (!copy) return null;

      return {
        type: 'nudge_two',
        copy,
        deepLinkRoute: '/daily-check-in',
        priority: 1,
        anchorKind: 'state',
        slot: 'afternoon',
        signalStrength: 2,
      };
    }
  }

  return null;
}

/**
 * NUDGE 3, Evening Close (reflection + forward-set)
 * 
 * Weekday: 18:00-21:30 → /daily-check-in
 * Friday: 18:30-21:30 (close-the-week)
 * Sunday: ONLY 17:00-19:30 (week-prep framing)
 * Saturday: DISABLED (their time)
 * 
 * Gate: No evening check-in yet
 * Gate: Exempt from signal richness (drive check-in KPI)
 */
async function evaluateNudgeThree(ctx: NudgeContext, alreadySentTypes: Set<string>): Promise<QualifiedNudge | null> {
  if (alreadySentTypes.has('nudge_three') || alreadySentTypes.has('evening_close')) return null;

  // ── v5.3 — PTO collapse: no evening close on PTO days ──
  if (ctx.dayContext.ptoMode) return null;

  // Saturday: NO evening nudge
  if (ctx.dayOfWeek === 6) {
    console.log(`[smart-nudges] User ${ctx.userId}, Saturday, no evening nudge`);
    return null;
  }

  // Skip if user already reflected today
  if (ctx.checkinCountToday >= 2) {
    console.log(`[smart-nudges] User ${ctx.userId} has ${ctx.checkinCountToday} check-ins, skipping evening close`);
    return null;
  }
  if (ctx.afternoonCheckinOutcome !== null) {
    console.log(`[smart-nudges] User ${ctx.userId} has afternoon check-in, skipping evening close`);
    return null;
  }

  let eveningStart = 18;
  let eveningEnd = 21.5;

  // Sunday: ONLY early evening (17:00-19:30) — recovery + mental prep tone
  if (ctx.dayOfWeek === 0) {
    eveningStart = 17;
    eveningEnd = 19.5;
  }
  // Friday: slightly earlier OK
  if (ctx.dayOfWeek === 5) {
    eveningStart = 18.5;
  }

  // v5 hard caps
  eveningStart = Math.max(eveningStart, GLOBAL_EARLIEST_LOCAL);
  eveningEnd = Math.min(eveningEnd, GLOBAL_LATEST_LOCAL);

  if (ctx.localTime < eveningStart || ctx.localTime >= eveningEnd) return null;

  // ── v5.3 — Look-ahead overlay: any evening (not just Sunday) where
  // tomorrow has a high-stakes event in the next 18 h gets a forward-set.
  const nowLookahead = Date.now();
  const lookaheadStakes = ctx.tomorrowEvents.find(e => {
    if (!isHighStakes(e.title)) return false;
    const startMs = new Date(e.start_time).getTime();
    const hours = (startMs - nowLookahead) / 3_600_000;
    return hours >= 0 && hours <= 18;
  });
  if (lookaheadStakes && ctx.dayOfWeek !== 0) {
    const copy = validateStaticFallbackCopy(
      getFallbackNudgeThreeLookaheadCopy(lookaheadStakes.title || 'a high-stakes meeting'),
      ctx, 'nudge_three',
    );
    if (copy) {
      return {
        type: 'nudge_three',
        copy,
        deepLinkRoute: '/daily-check-in',
        priority: 2,
        anchorKind: 'jit',
        slot: 'evening',
        signalStrength: 3,
      };
    }
  }

  const aiCopy = await generateNudgeCopy(ctx, 'nudge_three');
  const copy = aiCopy || validateStaticFallbackCopy(getFallbackNudgeThreeCopy(ctx), ctx, 'nudge_three');
  if (!copy) return null;

  // v7 — evening anchors to JIT when tomorrow has a non-noise first meeting,
  // otherwise to STATE (today's load / wearable / Sunday week prep).
  const tomorrowFirst = ctx.tomorrowEvents.find(e => !isNoiseEvent(e.title || ''));
  const anchorKind: 'jit' | 'state' = tomorrowFirst ? 'jit' : 'state';

  return {
    type: 'nudge_three',
    copy,
    deepLinkRoute: '/daily-check-in',
    priority: 2,
    anchorKind,
    slot: 'evening',
    signalStrength: anchorKind === 'jit' ? 2 : (ctx.hasWearableData ? 2 : 1),
  };
}

// ══════════════════════════════════════════════════════════════
// ── Post-MVP Evaluators (wrapped in MVP_POST_LAUNCH flag) ──
// ── Kept for future activation ──
// ══════════════════════════════════════════════════════════════

// P2: Calendar Gap
async function evaluateCalendarGap(ctx: NudgeContext, alreadySentTypes: Set<string>): Promise<QualifiedNudge | null> {
  if (!MVP_POST_LAUNCH) return null;
  if (alreadySentTypes.has('calendar_gap')) return null;
  if (ctx.inMeetingNow) return null;
  if (ctx.lastCheckinTime && (Date.now() - ctx.lastCheckinTime.getTime()) < 90 * 60000) return null;
  if (ctx.pendingPracticeIds.length === 0) return null;

  const now = Date.now();
  for (const gap of ctx.calendarGaps) {
    const fiveMinIntoGap = gap.startTime.getTime() + 5 * 60000;
    if (now < fiveMinIntoGap || now > gap.endTime.getTime()) continue;
    if (gap.postGapMeetingCount < 2 && !gap.postGapHasHighStakes) continue;

    return {
      type: 'calendar_gap',
      copy: { title: 'Gap Window', body: `You have ${gap.durationMinutes} minutes. Your next priority is ready.`, variantId: 'FB-GAP-artifact' },
      deepLinkRoute: '/executive-home',
      priority: 3,
      anchorKind: 'state',
      slot: 'afternoon',
      signalStrength: 1,
    };
  }
  return null;
}

// P3: Coach Commitment + Meeting Match
async function evaluateCoachMeetingMatch(ctx: NudgeContext, alreadySentTypes: Set<string>, supabase: ReturnType<typeof createClient>): Promise<QualifiedNudge | null> {
  if (!MVP_POST_LAUNCH) return null;
  if (alreadySentTypes.has('coach_meeting_match')) return null;
  if (ctx.coach.pendingCommitments.length === 0 && ctx.coach.stressSignals.length === 0) return null;
  if (ctx.coach.lastSessionAt && (Date.now() - ctx.coach.lastSessionAt.getTime()) < 2 * 60 * 60 * 1000) return null;

  const { data: todayCoachSessions } = await supabase
    .from('dialogue_sessions')
    .select('id')
    .eq('user_id', ctx.userId)
    .eq('flow_type', 'coach')
    .gte('started_at', `${ctx.todayStr}T00:00:00`)
    .limit(1);
  if (todayCoachSessions && todayCoachSessions.length > 0) return null;

  const now = Date.now();
  const fourHoursLater = now + 4 * 60 * 60 * 1000;
  const upcomingEvents = ctx.nonNoiseEvents.filter(e => {
    const startMs = new Date(e.start_time).getTime();
    return startMs > now && startMs < fourHoursLater;
  });

  for (const commitment of ctx.coach.pendingCommitments) {
    const commitWords = commitment.text.toLowerCase().split(/\s+/);
    const keyCommitWords = commitWords.filter(w => w.length > 3);

    for (const event of upcomingEvents) {
      const titleLower = (event.title || '').toLowerCase();
      const matchCount = keyCommitWords.filter(w => titleLower.includes(w)).length;
      const patternMatch = commitment.patternArea && titleLower.includes(commitment.patternArea.toLowerCase());

      if (matchCount >= 1 || patternMatch) {
        const minutesUntil = Math.round((new Date(event.start_time).getTime() - now) / 60000);
        if (minutesUntil < 45 || minutesUntil > 240) continue;

        return {
          type: 'coach_meeting_match',
          copy: { title: 'Coach Connection', body: `You committed to work on this – ${event.title} is the moment.`, variantId: 'FB-COACH' },
          deepLinkRoute: `/self-mastery-coach?context=commitment&commitment=${encodeURIComponent(commitment.text)}&meeting=${encodeURIComponent(event.title || '')}`,
          eventReference: event.external_id,
          commitmentText: commitment.text,
          meetingTitle: event.title || 'upcoming meeting',
          priority: 4,
          anchorKind: 'jit',
          slot: 'afternoon',
          signalStrength: 2,
        };
      }
    }
  }
  return null;
}

// P4: State-Aware Afternoon
async function evaluateStateAwareAfternoon(ctx: NudgeContext, alreadySentTypes: Set<string>): Promise<QualifiedNudge | null> {
  if (!MVP_POST_LAUNCH) return null;
  if (alreadySentTypes.has('state_aware_nudge')) return null;
  if (ctx.isWeekend) return null;
  if (ctx.localTime < 12 || ctx.localTime >= 15) return null;
  if (!ctx.morningCheckinOutcome || !LOW_TIERS.includes(ctx.morningCheckinOutcome)) return null;
  if (ctx.lastAppOpen && (Date.now() - ctx.lastAppOpen.getTime()) < 3 * 60 * 60 * 1000) return null;

  const afternoonHighStakes = ctx.highStakesEvents.filter(e => new Date(e.start_time).getHours() >= 12);
  if (afternoonHighStakes.length >= 1) {
    const eventTitle = afternoonHighStakes[0].title || 'your next meeting';
    return {
      type: 'state_aware_nudge',
      copy: { title: 'Recalibrate', body: `You started low. Recalibrate before ${eventTitle}.`, variantId: 'FB-STATE-recal' },
      deepLinkRoute: '/daily-check-in',
      priority: 5,
      anchorKind: 'state',
      slot: 'afternoon',
      signalStrength: 2,
    };
  }
  return null;
}

// P6: Pattern Alert
async function evaluatePatternAlert(ctx: NudgeContext, alreadySentTypes: Set<string>, supabase: ReturnType<typeof createClient>): Promise<QualifiedNudge | null> {
  if (!MVP_POST_LAUNCH) return null;
  if (alreadySentTypes.has('pattern_alert')) return null;
  if (ctx.lastAppOpen && (Date.now() - ctx.lastAppOpen.getTime()) < 4 * 60 * 60 * 1000) return null;
  return null;
}

// P7: Daily Fallback
async function evaluateDailyFallback(ctx: NudgeContext, alreadySentTypes: Set<string>, todayLogCount: number): Promise<QualifiedNudge | null> {
  if (!MVP_POST_LAUNCH) return null;
  if (todayLogCount > 0) return null;
  if (ctx.localTime < 10 || ctx.localTime >= 12) return null;
  return null;
}

// ══════════════════════════════════════════════════════════════
// ── Signal Richness Gate ──
// ══════════════════════════════════════════════════════════════

function computeSignalRichness(ctx: NudgeContext): {
  hasCalendar: boolean;
  hasWearable: boolean;
  hasCheckin: boolean;
  hasCoach: boolean;
  signalCount: number;
} {
  const hasCalendar = ctx.nonNoiseEvents.length > 0;
  const hasWearable = ctx.hasWearableData;
  const hasCheckin = ctx.checkinCountToday > 0;
  const hasCoach = ctx.coach.pendingCommitments.length > 0 || ctx.coach.sessionsIn7d > 0;
  const signalCount = [hasCalendar, hasWearable, hasCheckin, hasCoach].filter(Boolean).length;
  return { hasCalendar, hasWearable, hasCheckin, hasCoach, signalCount };
}

// ══════════════════════════════════════════════════════════════
// ── Engagement Learning ──
// ══════════════════════════════════════════════════════════════

interface EngagementProfile {
  typeEffectiveness: Record<string, { sent: number; tapped: number; rate: number }>;
  suppressedTypes: string[];
}

async function getUserEngagementProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<EngagementProfile> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: logs } = await supabase
    .from('notification_log')
    .select('notification_type, tapped')
    .eq('user_id', userId)
    .gte('sent_at', sevenDaysAgo);

  const typeEffectiveness: Record<string, { sent: number; tapped: number; rate: number }> = {};

  for (const log of (logs || [])) {
    const t = log.notification_type;
    if (!typeEffectiveness[t]) typeEffectiveness[t] = { sent: 0, tapped: 0, rate: 0 };
    typeEffectiveness[t].sent++;
    if (log.tapped) typeEffectiveness[t].tapped++;
  }

  const suppressedTypes: string[] = [];
  for (const [type, stats] of Object.entries(typeEffectiveness)) {
    stats.rate = stats.sent > 0 ? stats.tapped / stats.sent : 0;
    if (stats.sent >= 5 && stats.tapped === 0) {
      suppressedTypes.push(type);
    }
  }

  return { typeEffectiveness, suppressedTypes };
}

// ══════════════════════════════════════════════════════════════
// ── Day helpers ──
// ══════════════════════════════════════════════════════════════

function getUserLocalDate(timezoneOffset: number): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + timezoneOffset * 60000);
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isInDND(hour: number, dndStart: number | null, dndEnd: number | null): boolean {
  if (dndStart === null || dndEnd === null) return false;
  if (dndStart < dndEnd) return hour >= dndStart && hour < dndEnd;
  return hour >= dndStart || hour < dndEnd;
}

function isQuietDay(dayOfWeek: number, quietDays: number[] | null): boolean {
  if (!quietDays || quietDays.length === 0) return false;
  return quietDays.includes(dayOfWeek);
}

// ══════════════════════════════════════════════════════════════
// ── Main Handler ──
// ══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const platform = detectClientPlatform(req);
    const supabase = wrapDbWithCalendarPrimacy(
      createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      ),
      platform,
    );

    console.log('[smart-nudges] Starting evaluation run (v7 JIT-or-State, prep CTA, unified pattern store)...');

    // V8 test path — `?force_user=<id>` (or `?force_user_id=`) bypasses the
    // global quiet-window + DND checks for that one user so we can trigger
    // the AI copy path on demand and verify Claude→Gemini are reachable in
    // production. All other guards (cooldowns, suppression, anchor presence,
    // V8 validators) still run. Optional `?force_dry=1` skips APNs delivery.
    const url = new URL(req.url);
    const forceUserId =
      url.searchParams.get('force_user') ||
      url.searchParams.get('force_user_id') ||
      null;
    const forceDryRun = url.searchParams.get('force_dry') === '1';
    if (forceUserId) {
      console.log(`[smart-nudges][v8 test] force_user=${forceUserId} (bypassing window+DND, dry=${forceDryRun})`);
    }

    // 1. Fetch all users with active device tokens
    const { data: tokenRows, error: tokenErr } = await supabase
      .from('notification_device_tokens')
      .select('user_id, device_token, platform')
      .eq('is_active', true);

    if (tokenErr) throw tokenErr;
    if (!tokenRows || tokenRows.length === 0) {
      console.log('[smart-nudges] No active device tokens. Exiting.');
      return new Response(JSON.stringify({ processed: 0, notifications: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Group tokens by user
    const userTokens = new Map<string, Array<{ token: string; platform: string }>>();
    for (const row of tokenRows) {
      if (!userTokens.has(row.user_id)) userTokens.set(row.user_id, []);
      userTokens.get(row.user_id)!.push({ token: row.device_token, platform: row.platform });
    }

    const userIds = Array.from(userTokens.keys());
    console.log(`[smart-nudges] Evaluating ${userIds.length} users (MVP 3-nudge v4)`);

    // 2. Batch-fetch profiles, preferences, recent engagements
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    const [
      { data: profiles },
      { data: preferences },
      { data: recentEngagements },
    ] = await Promise.all([
      supabase.from('profiles').select('id, current_streak, timezone_offset').in('id', userIds),
      supabase.from('notification_preferences').select('*').in('user_id', userIds),
      supabase.from('user_engagements')
        .select('user_id, event_type, timestamp')
        .in('user_id', userIds)
        .eq('event_type', 'app_open')
        .gte('timestamp', fourHoursAgo),
    ]);

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));
    const prefMap = new Map((preferences || []).map(p => [p.user_id, p]));

    const lastAppOpenMap = new Map<string, Date>();
    for (const eng of (recentEngagements || [])) {
      const ts = new Date(eng.timestamp);
      const existing = lastAppOpenMap.get(eng.user_id);
      if (!existing || ts > existing) lastAppOpenMap.set(eng.user_id, ts);
    }

    const allNotifications: Array<{
      userId: string;
      type: string;
      copy: NudgeCopy;
      deepLinkRoute: string;
      eventReference?: string;
      commitmentText?: string;
      meetingTitle?: string;
      tokens: Array<{ token: string; platform: string }>;
      badge: number;
      isTravel: boolean;
      todayStr: string;
      qualificationWarnings: string[];
      v8Ctx: { eventTitles: string[]; checkinWord: string | null };
    }> = [];

    // 3. Evaluate each user
    for (const userId of userIds) {
      const profile = profileMap.get(userId);
      const prefs = prefMap.get(userId);
      const tzOffset = profile?.timezone_offset ?? 0;
      const localDate = getUserLocalDate(tzOffset);
      const localHour = localDate.getHours();
      const localMinute = localDate.getMinutes();
      const dayOfWeek = localDate.getDay();
      const todayStr = toDateString(localDate);

      const tomorrowDate = new Date(localDate);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowStr = toDateString(tomorrowDate);

      // ── Quiet Hours: 10pm–6:30am ──
      const localTime = localHour + localMinute / 60;
      const isForcedUser = forceUserId !== null && forceUserId === userId;
      // v5: hard floor at GLOBAL_EARLIEST_LOCAL (08:00) — kills 6/7am sends
      if (!isForcedUser && (localTime >= GLOBAL_LATEST_LOCAL || localTime < GLOBAL_EARLIEST_LOCAL)) {
        console.log(`[smart-nudges][v5] User ${userId} outside global window (${localTime.toFixed(1)}). Skipping.`);
        continue;
      }

      // DND / quiet day check
      const dndStart = prefs?.dnd_start ?? null;
      const dndEnd = prefs?.dnd_end ?? null;
      if (!isForcedUser && isInDND(localHour, dndStart, dndEnd)) continue;
      if (!isForcedUser && isQuietDay(dayOfWeek, prefs?.quiet_days ?? null)) continue;

      // Convert local midnight to UTC for log queries
      const localMidnightMs = new Date(`${todayStr}T00:00:00`).getTime();
      const todayStartUtc = new Date(localMidnightMs - tzOffset * 60000).toISOString();
      const todayEndUtc = new Date(localMidnightMs - tzOffset * 60000 + 24 * 60 * 60 * 1000).toISOString();

      // Fetch today's notification log
      const { data: todayLogs } = await supabase
        .from('notification_log')
        .select('notification_type, variant_id, sent_at, event_reference')
        .eq('user_id', userId)
        .gte('sent_at', todayStartUtc)
        .lt('sent_at', todayEndUtc)
        .order('sent_at', { ascending: false });

      // ── DAILY CAP ──
      if (todayLogs && todayLogs.length >= DAILY_NOTIFICATION_CAP) {
        console.log(`[smart-nudges] User ${userId} hit daily cap (${todayLogs.length}/${DAILY_NOTIFICATION_CAP}). Skipping.`);
        continue;
      }

      // 2-hour suppression check
      const twoHoursAgoIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: recentLogs } = await supabase
        .from('notification_log')
        .select('sent_at')
        .eq('user_id', userId)
        .gte('sent_at', twoHoursAgoIso)
        .order('sent_at', { ascending: false })
        .limit(1);

      const lastSentAt = recentLogs?.[0] ? new Date(recentLogs[0].sent_at) : null;
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const suppressed = lastSentAt !== null && lastSentAt > twoHoursAgo;

      // ── In-meeting / app-open suppression ──
      const lastAppOpen = lastAppOpenMap.get(userId) || null;
      // v5: 60-min cool-down after app open (was 30)
      const appOpenedRecently = lastAppOpen && (Date.now() - lastAppOpen.getTime()) < APP_OPEN_COOLDOWN_MS;

      if (appOpenedRecently) {
        console.log(`[smart-nudges][v5] User ${userId} opened app within 60 min. Skipping.`);
        continue;
      }

      // ── Engagement learning ──
      const engagementProfile = await getUserEngagementProfile(supabase, userId);

      function isEngagementSuppressed(type: string): boolean {
        if (!engagementProfile.suppressedTypes.includes(type)) return false;
        const hash = (userId + type + todayStr).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        return hash % 2 === 0;
      }

      // ══════════════════════════════════════════════════
      // ── Build NudgeContext (single parallel query) ──
      // ══════════════════════════════════════════════════
      const ctx = await buildNudgeContext(
        supabase, userId, todayStr, tomorrowStr,
        localHour, localMinute, dayOfWeek,
        profile?.current_streak || 0,
        lastAppOpen,
      );

      // v7 — hydrate unified pattern store (causality_findings.signal_summary)
      ctx.pattern = await loadPatternSummary(supabase, userId);

      // Already-sent types today
      const alreadySentTypes = new Set((todayLogs || []).map(l => l.notification_type));
      const sentEventRefs = new Set((todayLogs || []).map(l => l.event_reference).filter(Boolean) as string[]);

      // ══════════════════════════════════════════════════
      // ── MVP 3-Nudge Cascade: Nudge 1 → 2 → 3 ──
      // ══════════════════════════════════════════════════
      const qualified: QualifiedNudge[] = [];

      // Nudge 1: First Touch (exempt from signal gate + 2h suppression for JIT)
      if ((prefs?.morning_anchor_enabled ?? true) && !isEngagementSuppressed('nudge_one')) {
        const nudge = await evaluateNudgeOne(ctx, alreadySentTypes, sentEventRefs, supabase);
        if (nudge) qualified.push(nudge);
      }

      // Nudge 2: Mid-day Action (exempt from signal gate, respects 2h suppression unless JIT)
      if ((prefs?.pre_event_prep_enabled ?? true) && !isEngagementSuppressed('nudge_two') && !suppressed) {
        const nudge = await evaluateNudgeTwo(ctx, alreadySentTypes, sentEventRefs, supabase);
        if (nudge) qualified.push(nudge);
      }
      // If suppressed but has JIT, still allow Nudge 2 JIT variant
      if (suppressed && (prefs?.pre_event_prep_enabled ?? true)) {
        const nudge = await evaluateNudgeTwo(ctx, alreadySentTypes, sentEventRefs, supabase);
        if (nudge && nudge.deepLinkRoute === '/executive-home') {
          // JIT variant — override suppression
          qualified.push(nudge);
        }
      }

      // Nudge 3: Evening Close (exempt from signal richness gate for MVP)
      if ((prefs?.evening_close_enabled ?? true) && !isEngagementSuppressed('nudge_three') && !suppressed) {
        const nudge = await evaluateNudgeThree(ctx, alreadySentTypes);
        if (nudge) qualified.push(nudge);
      }

      // Post-MVP evaluators (all gated by MVP_POST_LAUNCH = false)
      if (MVP_POST_LAUNCH) {
        const signals = computeSignalRichness(ctx);
        const signalGatePassed = signals.signalCount >= 2;

        if (!suppressed) {
          const gap = await evaluateCalendarGap(ctx, alreadySentTypes);
          if (gap) qualified.push(gap);

          const coach = await evaluateCoachMeetingMatch(ctx, alreadySentTypes, supabase);
          if (coach) qualified.push(coach);
        }

        if (signalGatePassed && !suppressed) {
          const state = await evaluateStateAwareAfternoon(ctx, alreadySentTypes);
          if (state) qualified.push(state);

          const pattern = await evaluatePatternAlert(ctx, alreadySentTypes, supabase);
          if (pattern) qualified.push(pattern);
        }

        if (qualified.length === 0 && signalGatePassed) {
          const fallback = await evaluateDailyFallback(ctx, alreadySentTypes, (todayLogs || []).length);
          if (fallback) qualified.push(fallback);
        }
      }

      // ── Select best notification (v7 comparator) ──
      // 1. Slot rank: morning > evening > afternoon
      // 2. Anchor:   JIT > STATE
      // 3. Signal strength (descending)
      // 4. Priority (ascending) as final tiebreaker
      const SLOT_RANK: Record<'morning' | 'afternoon' | 'evening', number> = {
        morning: 0, evening: 1, afternoon: 2,
      };
      qualified.sort((a, b) => {
        const sa = SLOT_RANK[a.slot] - SLOT_RANK[b.slot];
        if (sa !== 0) return sa;
        const aa = (a.anchorKind === 'jit' ? 0 : 1) - (b.anchorKind === 'jit' ? 0 : 1);
        if (aa !== 0) return aa;
        const ss = b.signalStrength - a.signalStrength;
        if (ss !== 0) return ss;
        return a.priority - b.priority;
      });

      // Deduplicate by type (in case JIT override added a duplicate)
      const seen = new Set<string>();
      const deduped = qualified.filter(n => {
        if (seen.has(n.type)) return false;
        seen.add(n.type);
        return true;
      });

      if (deduped.length > 0) {
        const bestNudge = deduped[0];

        // JIT nudges override 2h suppression
        const isJitNudge = bestNudge.deepLinkRoute === '/executive-home' && 
          (bestNudge.type === 'nudge_one' || bestNudge.type === 'nudge_two');

        if (suppressed && !isJitNudge) {
          console.log(`[smart-nudges] User ${userId} 2h-suppressed, no JIT. Skipping ${bestNudge.type}.`);
        } else {
          // ── v5.3 — Receipt-feedback: stamp warning if last 3 sends for
          // this family expired before delivery (per-user timing signal).
          const family = nudgeFamily(bestNudge.type);
          const { data: lastThree } = await supabase
            .from('notification_log')
            .select('delivery_state, notification_type')
            .eq('user_id', userId)
            .eq('notification_type', family)
            .order('sent_at', { ascending: false })
            .limit(3);
          const qualificationWarnings: string[] = [];
          if ((lastThree || []).length >= 3 &&
              (lastThree || []).every((r: any) => r.delivery_state === 'expired_before_delivery')) {
            qualificationWarnings.push('repeated_expiry');
          }
          const isTravel = !!(ctx.dayContext.preFlight || ctx.dayContext.inFlight);
          allNotifications.push({
            userId,
            type: bestNudge.type,
            copy: bestNudge.copy,
            deepLinkRoute: bestNudge.deepLinkRoute,
            eventReference: bestNudge.eventReference,
            commitmentText: bestNudge.commitmentText,
            meetingTitle: bestNudge.meetingTitle,
            tokens: userTokens.get(userId)!,
            badge: ctx.badgeCount ?? 1,
            isTravel,
            todayStr,
            qualificationWarnings,
            // V8 — capture per-user named-context tokens so the post-CTA
            // recheck can satisfy requiresNamedContextToken() for AI bodies
            // anchored on event titles or the morning check-in word.
            v8Ctx: buildV8CtxForCheck(ctx),
          });
        }
      }
    }

    console.log(`[smart-nudges] ${allNotifications.length} notifications qualified`);

    // 4. Send notifications via APNs
    const apnsKey = Deno.env.get('APNS_P8_KEY');
    const apnsKeyId = Deno.env.get('APNS_KEY_ID');
    const apnsTeamId = Deno.env.get('APNS_TEAM_ID');
    const apnsBundleId = Deno.env.get('APNS_BUNDLE_ID') || 'com.moonshot.mindmoduleapp';
    const apnsEnv = Deno.env.get('APNS_ENVIRONMENT') || 'development';
    const apnsHost = apnsEnv === 'production' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
    const isDryRun = (!apnsKey || !apnsKeyId || !apnsTeamId) || forceDryRun;

    if (isDryRun) {
      const missing = [
        !apnsKey && 'APNS_P8_KEY',
        !apnsKeyId && 'APNS_KEY_ID',
        !apnsTeamId && 'APNS_TEAM_ID',
      ].filter(Boolean);
      console.warn(`[smart-nudges] DRY RUN – missing secrets: ${missing.join(', ')}`);
    } else {
      console.log(`[smart-nudges] APNs config: host=${apnsHost} topic=${apnsBundleId} env=${apnsEnv}`);
    }

    let sendSuccess = 0;
    let sendFailed = 0;
    let sendAttempted = 0;
    let suppressedPostCta = 0;
    const shippedNotifications: typeof allNotifications = [];

    let apnsJwt: string | null = null;
    if (!isDryRun) {
      try {
        apnsJwt = await createApnsJwt(apnsKey!, apnsKeyId!, apnsTeamId!);
      } catch (e) {
        console.error('[smart-nudges] Failed to create APNs JWT:', e);
      }
    }

    for (const notif of allNotifications) {
      const effectiveRoute = notif.deepLinkRoute;

      // ── A/B CTA variant assignment (v5.1) ──
      const ctaVariant = assignCtaVariant(notif.userId, nudgeFamily(notif.type));
      notif.copy = applyCtaVariant(notif.copy, ctaVariant, effectiveRoute);

      // V8 — final post-rewrite check. The CTA variant rewriter mutates the
      // trailing verb; if anything in the chain produces a non-V8 body we
      // suppress the send rather than ship V7 phrasing.
      // Pass the per-notification ctx so AI bodies anchored on real event
      // titles or the morning check-in word satisfy requiresNamedContextToken
      // (was previously dropped because ctx was missing).
      const finalViolation = violatesCopyContractV8(notif.copy.body, notif.v8Ctx);
      if (finalViolation && !(isLowContextStaticFallbackVariant(notif.copy.variantId) && isNamedContextViolation(finalViolation))) {
        console.warn(
          `[smart-nudges v8] SUPPRESSED post-CTA send: type=${notif.type} variant=${notif.copy.variantId} reason=${finalViolation} body="${notif.copy.body}"`,
        );
        suppressedPostCta++;
        // Audit-log the suppression so SQL dashboards can see why a qualified
        // notification never shipped. Without this row, finding why the cron
        // run is silent requires scraping function logs.
        await supabase.from('notification_log').insert({
          user_id: notif.userId,
          notification_type: notif.type,
          variant_id: notif.copy.variantId,
          event_reference: notif.eventReference || null,
          delivery_state: 'suppressed',
          payload: {
            title: notif.copy.title,
            body: notif.copy.body,
            notification_type: notif.type,
            variant_id: notif.copy.variantId,
            architecture: 'cos-mind-v8-meaning-forward',
            suppression_reason: finalViolation,
            suppression_stage: 'post_cta',
            ai_provider_used: notif.copy.aiProvider ?? 'static',
          },
        });
        continue;
      }
      if (finalViolation) {
        console.log(
          `[smart-nudges v8] Allowed low-context post-CTA send: type=${notif.type} variant=${notif.copy.variantId} reason=${finalViolation}`,
        );
      }
      shippedNotifications.push(notif);

      const payload: Record<string, unknown> = {
        title: notif.copy.title,
        body: notif.copy.body,
        notification_type: notif.type,
        variant_id: notif.copy.variantId,
        deep_link_route: effectiveRoute,
        dry_run: isDryRun,
        architecture: 'cos-mind-v8-meaning-forward',
        cta_variant: ctaVariant,
        cta_experiment: 'cta-action-verb-v2',
        // v5.3 — Per-intent TTL + collapse-id telemetry
        apns_expiration: Math.floor(Date.now() / 1000) + nudgeTtlSeconds(notif.copy.variantId, notif.type),
        apns_collapse_id: nudgeCollapseId(nudgeFamily(notif.type), notif.todayStr, notif.isTravel),
        badge: notif.badge,
        qualification_warnings: notif.qualificationWarnings,
        // V8 telemetry — also persist under payload.metadata so SQL
        // dashboards that query JSON paths like
        // payload.metadata.architecture see the V8 tags.
        metadata: {
          architecture: 'cos-mind-v8-meaning-forward',
          cta_experiment: 'cta-action-verb-v2',
          cta_variant: ctaVariant,
          ai_fallback_chain: 'claude-haiku → gemini-flash → static',
          // Which provider in the fallback chain actually produced the
          // copy that shipped. Defensive default 'static' — every NudgeCopy
          // returned to the send loop should carry this stamp.
          ai_provider_used: notif.copy.aiProvider ?? 'static',
        },
        decision_trace: {
          variant: notif.copy.variantId,
          route: effectiveRoute,
          type: notif.type,
          cta_variant: ctaVariant,
          ai_provider_used: notif.copy.aiProvider ?? 'static',
        },
      };

      const { data: logRow } = await supabase.from('notification_log').insert({
        user_id: notif.userId,
        notification_type: notif.type,
        variant_id: notif.copy.variantId,
        event_reference: notif.eventReference || null,
        delivery_state: 'pending',
        payload,
      }).select('id').single();

      const notificationLogId = logRow?.id;

      if (!isDryRun && apnsJwt) {
        for (const tokenInfo of notif.tokens) {
          if (tokenInfo.platform !== 'ios') continue;
          sendAttempted++;
          const normalizedToken = tokenInfo.token.trim().toLowerCase();
          if (!isCanonicalIosApnsToken(normalizedToken)) {
            console.error(`[smart-nudges] Deactivating malformed APNs token user=${notif.userId} len=${tokenInfo.token.length} prefix=${tokenInfo.token.substring(0, 12)}...`);
            sendFailed++;
            if (notificationLogId) {
              await supabase
                .from('notification_log')
                .update({
                  payload: {
                    ...payload,
                    apns_status: 0,
                    apns_reason: 'MalformedDeviceToken',
                    apns_token_prefix: tokenInfo.token.substring(0, 12),
                    apns_token_length: tokenInfo.token.length,
                  },
                  delivery_state: 'failed',
                })
                .eq('id', notificationLogId);
            }
            await supabase
              .from('notification_device_tokens')
              .update({ is_active: false })
              .eq('user_id', notif.userId)
              .eq('device_token', tokenInfo.token);
            continue;
          }
          try {
            const result = await sendApnsPush(
              normalizedToken,
              apnsJwt,
              apnsBundleId,
              notif.copy.title,
              notif.copy.body,
              {
                notification_type: notif.type,
                variant_id: notif.copy.variantId,
                notification_log_id: notificationLogId || '',
                deep_link_route: effectiveRoute,
                expiration_ts: String((payload as any).apns_expiration ?? ''),
              },
              apnsHost,
              {
                ttlSeconds: nudgeTtlSeconds(notif.copy.variantId, notif.type),
                collapseId: nudgeCollapseId(nudgeFamily(notif.type), notif.todayStr, notif.isTravel),
                badge: notif.badge,
              },
            );
            if (result.ok) sendSuccess++;
            else sendFailed++;

            // Persist APNs result on the notification_log row for SQL-level debugging.
            if (notificationLogId) {
              await supabase
                .from('notification_log')
                .update({
                  payload: {
                    ...payload,
                    apns_status: result.status,
                    apns_reason: result.reason,
                    apns_token_prefix: tokenInfo.token.substring(0, 12),
                    apns_expiration: result.expirationTs,
                    apns_collapse_id: result.collapseId,
                  },
                  delivery_state: result.ok ? 'accepted' : 'failed',
                })
                .eq('id', notificationLogId);
            }

            // Auto-deactivate tokens APNs has rejected as permanently bad.
            // 400 BadDeviceToken / 410 Unregistered are the documented contract.
            const reasonLc = (result.reason || '').toLowerCase();
            const shouldDeactivate =
              result.status === 410 ||
              (result.status === 400 && (
                reasonLc.includes('baddevicetoken') ||
                reasonLc.includes('devicetokennotforTopic'.toLowerCase())
              ));
            if (shouldDeactivate) {
              console.log(`[smart-nudges] Deactivating dead token user=${notif.userId} prefix=${tokenInfo.token.substring(0, 12)}... status=${result.status} reason=${result.reason}`);
              await supabase
                .from('notification_device_tokens')
                .update({ is_active: false })
                .eq('user_id', notif.userId)
                .eq('device_token', tokenInfo.token);
            }
          } catch (e) {
            console.error(`[smart-nudges] APNs send error for ${notif.userId}:`, e);
            sendFailed++;
            // Persist the throw so the row doesn't stay 'pending' forever and
            // network/JWT failures are queryable from SQL.
            if (notificationLogId) {
              await supabase
                .from('notification_log')
                .update({
                  payload: {
                    ...payload,
                    apns_status: 0,
                    apns_reason: 'send_threw',
                    apns_error: String(e),
                    apns_token_prefix: tokenInfo.token.substring(0, 12),
                  },
                  delivery_state: 'failed',
                })
                .eq('id', notificationLogId);
            }
          }
        }
      }

      console.log(`[smart-nudges] ${isDryRun ? 'DRY RUN' : 'SENT'}: ${notif.type}/${notif.copy.variantId} → ${notif.userId} | "${notif.copy.body}"`);
    }

    console.log(
      `[smart-nudges] summary qualified=${allNotifications.length} shipped=${shippedNotifications.length} suppressed_post_cta=${suppressedPostCta} attempted=${sendAttempted} sent=${sendSuccess} failed=${sendFailed} dry_run=${isDryRun}`,
    );

    return new Response(JSON.stringify({
      processed: userIds.length,
      notifications: shippedNotifications.length,
      qualified_notifications: allNotifications.length,
      shipped_notifications: shippedNotifications.length,
      suppressed_post_cta: suppressedPostCta,
      apns_attempted: sendAttempted,
      dry_run: isDryRun,
      apns_success: sendSuccess,
      apns_failed: sendFailed,
      architecture: 'cos-mind-v8-meaning-forward',
      details: shippedNotifications.map(n => ({
        user_id: n.userId,
        type: n.type,
        variant: n.copy.variantId,
        title: n.copy.title,
        body: n.copy.body,
        deep_link: n.deepLinkRoute,
      })),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('[smart-nudges] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
