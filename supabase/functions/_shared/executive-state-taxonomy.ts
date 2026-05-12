// ═══════════════════════════════════════════════════════════════════════
// Executive State Operating System — Unified Taxonomy
// Single source of truth for: Smart Nudges, Brief, Signal Pills (Next Up),
// Mastery Plan, JIT, Insights Cause-Effect.
//
// Replaces previously divergent inline keyword lists across edge functions.
// See .lovable/plan.md for the full spec.
// ═══════════════════════════════════════════════════════════════════════

// ── Layer 1: Pillars ──────────────────────────────────────────────────

export type Pillar = 1 | 2 | 3 | 4 | 5;

export interface PillarMeta {
  id: Pillar;
  name: string;
  priorityState: string;
  risks: string[];
  baseWeight: number; // used in stakesScore()
}

export const PILLAR_META: Record<Pillar, PillarMeta> = {
  1: { id: 1, name: 'Strategic Cognition', priorityState: 'Flow + Clarity', risks: ['decision leakage','cognitive overload','narrowed thinking','fatigue-driven simplification'], baseWeight: 60 },
  2: { id: 2, name: 'Executive Presence & Influence', priorityState: 'Activated Calm', risks: ['adrenaline overshoot','emotional hijack','performance anxiety','vocal/cognitive fatigue'], baseWeight: 70 },
  3: { id: 3, name: 'Emotional Load & Leadership Labor', priorityState: 'Regulated Presence', risks: ['emotional leakage','compassion fatigue','suppression debt','irritability carry-over'], baseWeight: 65 },
  4: { id: 4, name: 'Operational Pressure & Execution', priorityState: 'Controlled Output', risks: ['attentional fragmentation','NS overload','stress accumulation','reactive lock'], baseWeight: 40 },
  5: { id: 5, name: 'Recovery & Reintegration', priorityState: 'Downregulation + Reset', risks: ['post-adrenaline crash','emotional residue','sleep disruption','cognitive fatigue debt'], baseWeight: 0 },
};

// ── Layer 2: Demand Profile ───────────────────────────────────────────

export type DemandDim = 'cog' | 'emo' | 'vis' | 'pol' | 'rel' | 'ene' | 'cir' | 'id';
export type DemandProfile = Record<DemandDim, 0 | 1 | 2 | 3>;

const D = (cog: number, emo: number, vis: number, pol: number, rel: number, ene: number, cir: number, id: number): DemandProfile =>
  ({ cog, emo, vis, pol, rel, ene, cir, id }) as DemandProfile;

export function demandSum(p: DemandProfile): number {
  return p.cog + p.emo + p.vis + p.pol + p.rel + p.ene + p.cir + p.id;
}

// ── Layer 3: Canonical Event Types ────────────────────────────────────

export type EventGroup = 'A_governance' | 'B_investor' | 'C_strategic' | 'D_visibility'
  | 'E_leadership' | 'F_operational' | 'G_travel' | 'H_recovery';

export type RegulationObjective = 'PREPARE' | 'PREVENT' | 'PROTECT' | 'RECOVER';
export type InterventionType = 'Pause' | 'Flow' | 'Reenergise';

export interface TimingMatrix { pre: boolean; during: boolean; post: boolean; postMandatory?: boolean }

export interface EventType {
  id: string;
  label: string;
  bucket: string;            // legacy bucket label (causality_findings.signal_summary)
  group: EventGroup;
  primaryPillar: Pillar;
  secondaryPillar?: Pillar;
  demandProfile: DemandProfile;
  timingMatrix: TimingMatrix;
  regulationObjective: RegulationObjective;
  interventionType: InterventionType;
  keywords: string[];
  masteryModules?: string[];
  jitLeadTimeMinutes?: number;
}

// ── Master Taxonomy Table ─────────────────────────────────────────────

export const EVENT_TYPES: EventType[] = [
  // A. Governance & Board
  { id:'gov.board_meeting', label:'Board meeting', bucket:'Board / governance', group:'A_governance', primaryPillar:1, secondaryPillar:2, demandProfile:D(3,1,3,3,1,2,0,3), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['board meeting','board of directors','board'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:1440 },
  { id:'gov.board_committee', label:'Board committee', bucket:'Board / governance', group:'A_governance', primaryPillar:1, secondaryPillar:2, demandProfile:D(3,1,2,3,1,1,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['audit committee','remco','nomco','board committee','governance'] },
  { id:'gov.board_prep', label:'Board prep', bucket:'Board / governance', group:'A_governance', primaryPillar:1, demandProfile:D(3,0,1,2,0,1,0,1), timingMatrix:{pre:false,during:false,post:false}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['board deck','board prep','board presentation','board materials'], masteryModules:['align','prepare'], jitLeadTimeMinutes:2880 },
  // B. Investor & Financial Pressure
  { id:'inv.investor_meeting', label:'Investor meeting', bucket:'Investor calls', group:'B_investor', primaryPillar:2, secondaryPillar:1, demandProfile:D(2,2,3,2,1,2,0,3), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['investor','vc ',' vc','lp meeting','limited partner'], masteryModules:['regulate','prepare'], jitLeadTimeMinutes:1440 },
  { id:'inv.fundraising', label:'Fundraising', bucket:'Investor calls', group:'B_investor', primaryPillar:2, secondaryPillar:1, demandProfile:D(2,2,3,2,1,3,0,3), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['fundraise','fundraising','raise','pitch deck','pitch','funding'] },
  { id:'inv.earnings_call', label:'Earnings call', bucket:'Investor calls', group:'B_investor', primaryPillar:2, secondaryPillar:1, demandProfile:D(3,1,3,2,0,2,0,3), timingMatrix:{pre:true,during:false,post:true,postMandatory:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['earnings call','earnings'] },
  { id:'inv.budget_review', label:'Budget / forecast review', bucket:'Reviews', group:'B_investor', primaryPillar:1, demandProfile:D(3,1,1,2,1,1,0,1), timingMatrix:{pre:true,during:false,post:false}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['budget','finance review','forecast','financial planning'], masteryModules:['align','prepare'], jitLeadTimeMinutes:1440 },
  { id:'inv.ma_discussion', label:'M&A discussion', bucket:'Investor calls', group:'B_investor', primaryPillar:1, secondaryPillar:2, demandProfile:D(3,2,2,3,1,2,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['m&a','merger','acquisition','due diligence','acqui-hire'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:2880 },
  // C. Strategic & Cognitive Load
  { id:'str.strategy_planning', label:'Strategy planning', bucket:'Internal builds', group:'C_strategic', primaryPillar:1, demandProfile:D(3,0,1,1,1,1,0,1), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['strategy','strategic planning','vision','roadmap'], masteryModules:['align','prepare'], jitLeadTimeMinutes:1440 },
  { id:'str.deep_work', label:'Deep work block', bucket:'Deep work blocks', group:'C_strategic', primaryPillar:1, demandProfile:D(3,0,0,0,0,1,0,0), timingMatrix:{pre:false,during:true,post:false}, regulationObjective:'PROTECT', interventionType:'Flow', keywords:['deep work','focus block','writing time'] },
  { id:'str.qbr', label:'QBR / Quarterly review', bucket:'Reviews', group:'C_strategic', primaryPillar:1, secondaryPillar:4, demandProfile:D(3,1,2,2,2,2,0,2), timingMatrix:{pre:true,during:true,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['quarterly','qbr','q1 review','q2 review','q3 review','q4 review'], masteryModules:['align','prepare'], jitLeadTimeMinutes:2880 },
  // D. Executive Influence & Visibility
  { id:'vis.keynote', label:'Keynote', bucket:'Networking & community', group:'D_visibility', primaryPillar:2, demandProfile:D(1,1,3,1,0,3,0,3), timingMatrix:{pre:true,during:false,post:true,postMandatory:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['keynote'] },
  { id:'vis.speaking', label:'Conference speaking / Panel', bucket:'Networking & community', group:'D_visibility', primaryPillar:2, demandProfile:D(1,1,3,1,0,2,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['conference','summit','panel','speaking','webinar'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:720 },
  { id:'vis.media', label:'Media / Press / Podcast', bucket:'Networking & community', group:'D_visibility', primaryPillar:2, demandProfile:D(2,1,3,1,1,2,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['interview','podcast','media','press','journalist','pr '], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:360 },
  { id:'vis.all_hands', label:'All-hands / Town hall', bucket:'All-hands', group:'D_visibility', primaryPillar:2, secondaryPillar:3, demandProfile:D(1,2,3,1,2,2,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['all-hands','all hands','town hall','townhall','company meeting'], masteryModules:['regulate','align'], jitLeadTimeMinutes:240 },
  { id:'vis.client_presentation', label:'Client / customer presentation', bucket:'Client meetings', group:'D_visibility', primaryPillar:2, secondaryPillar:1, demandProfile:D(2,1,2,1,2,2,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['client','customer','demo','proposal','account review','stakeholder'], masteryModules:['align','prepare'], jitLeadTimeMinutes:480 },
  // E. Leadership & People
  { id:'lead.executive_1on1', label:'Executive 1:1', bucket:'1:1s', group:'E_leadership', primaryPillar:3, demandProfile:D(1,2,1,1,3,1,0,1), timingMatrix:{pre:false,during:false,post:false}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['1:1','1-1','one on one','1on1'] },
  { id:'lead.leadership_sync', label:'Leadership / Exec team sync', bucket:'Exec / leadership', group:'E_leadership', primaryPillar:3, secondaryPillar:1, demandProfile:D(2,1,1,2,2,1,0,1), timingMatrix:{pre:true,during:false,post:false}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['leadership team','exec team','c-suite','slt','management meeting','leadership','exec ',' exec','executive','ceo ',' ceo','cto ',' cto'], masteryModules:['regulate','align'], jitLeadTimeMinutes:240 },
  { id:'lead.performance_review', label:'Performance review', bucket:'Reviews', group:'E_leadership', primaryPillar:3, secondaryPillar:1, demandProfile:D(2,3,1,2,3,2,0,2), timingMatrix:{pre:true,during:false,post:true,postMandatory:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['performance review','annual review','mid-year review','360 feedback','360 review'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:480 },
  { id:'lead.difficult_conversation', label:'Difficult conversation / Escalation', bucket:'Exec / leadership', group:'E_leadership', primaryPillar:3, demandProfile:D(1,3,1,2,3,2,0,1), timingMatrix:{pre:true,during:false,post:true,postMandatory:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['difficult','feedback','pip','conflict','dispute','tension','confrontation','escalation'], masteryModules:['regulate','prepare'], jitLeadTimeMinutes:240 },
  { id:'lead.layoff', label:'Layoff / Restructure', bucket:'Exec / leadership', group:'E_leadership', primaryPillar:3, secondaryPillar:2, demandProfile:D(1,3,2,2,3,2,0,2), timingMatrix:{pre:true,during:false,post:true,postMandatory:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['layoff','restructuring','restructure','reduction','rif','downsizing','termination'], masteryModules:['regulate','prepare'], jitLeadTimeMinutes:1440 },
  { id:'lead.hiring_committee', label:'Hiring committee / Interview', bucket:'Interviews', group:'E_leadership', primaryPillar:3, secondaryPillar:1, demandProfile:D(2,1,1,1,2,1,0,1), timingMatrix:{pre:true,during:false,post:false}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['interview','candidate','final round','hiring committee','offer discussion','executive hire'], masteryModules:['align','prepare'], jitLeadTimeMinutes:240 },
  { id:'lead.negotiation', label:'Negotiation', bucket:'Exec / leadership', group:'E_leadership', primaryPillar:2, secondaryPillar:3, demandProfile:D(2,2,1,3,2,2,0,1), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['negotiation','contract','deal terms','partnership terms'], masteryModules:['regulate','prepare'], jitLeadTimeMinutes:720 },
  // F. Operational Pressure
  { id:'ops.crisis', label:'Crisis / Incident', bucket:'Exec / leadership', group:'F_operational', primaryPillar:4, secondaryPillar:3, demandProfile:D(3,3,2,2,2,3,0,2), timingMatrix:{pre:false,during:true,post:true,postMandatory:true}, regulationObjective:'PROTECT', interventionType:'Pause', keywords:['crisis','urgent','emergency','incident','escalation'], masteryModules:['regulate'], jitLeadTimeMinutes:120 },
  { id:'ops.product_launch', label:'Product launch / Go-live', bucket:'Internal builds', group:'F_operational', primaryPillar:4, secondaryPillar:2, demandProfile:D(2,2,2,1,2,3,0,2), timingMatrix:{pre:true,during:true,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['launch','go live','release','ship','product launch'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:1440 },
  { id:'ops.catchup', label:'Catch-up / Sync', bucket:'Catch-ups & syncs', group:'F_operational', primaryPillar:4, demandProfile:D(1,1,0,0,2,1,0,0), timingMatrix:{pre:false,during:false,post:false}, regulationObjective:'PROTECT', interventionType:'Pause', keywords:['catchup','catch-up','catch up','sync','check-in','check in','weekly','standup','stand-up'] },
  // G. Travel & Circadian Disruption
  { id:'trv.long_haul', label:'Long-haul flight', bucket:'Internal builds', group:'G_travel', primaryPillar:4, secondaryPillar:5, demandProfile:D(1,1,0,0,0,3,3,0), timingMatrix:{pre:true,during:true,post:true,postMandatory:true}, regulationObjective:'PROTECT', interventionType:'Pause', keywords:['long-haul','long haul','red-eye','redeye','overnight flight'] },
  { id:'trv.flight', label:'Flight / Travel', bucket:'Internal builds', group:'G_travel', primaryPillar:4, secondaryPillar:5, demandProfile:D(1,1,0,0,0,2,2,0), timingMatrix:{pre:true,during:true,post:true}, regulationObjective:'PROTECT', interventionType:'Pause', keywords:['flight','airport','boarding','departure','arrival','layover','transit'] },
  // H. Recovery
  { id:'rec.pto', label:'PTO / Time off', bucket:'Deep work blocks', group:'H_recovery', primaryPillar:5, demandProfile:D(0,0,0,0,0,0,0,1), timingMatrix:{pre:false,during:false,post:false}, regulationObjective:'RECOVER', interventionType:'Pause', keywords:['out of office','ooo','annual leave','holiday','vacation','pto','day off','away'] },
];

// ── Noise Filter (Section H, pruned) ──────────────────────────────────

export const NOISE_KEYWORDS: string[] = [
  // Transport sub-tasks (parent travel day is the intervention point)
  'station','bus','taxi','uber','cab','car service','platform',
  // Errands
  'delivery','pick up','dry cleaning','groceries','pharmacy','haircut',
  'mot','oil change','dentist','optician',
  // Calendar tooling artifacts
  'reminder','auto-pay','subscription','booking confirmation','ticket','reservation',
  // Personal blocks
  'placeholder','tentative','hold','blocked','do not book','dnb','no meetings','buffer',
  'lunch','break','commute',
];

export const NOISE_PATTERN = /\[\d{6,}\]/;

export const PERSONAL_BLOCK_PATTERN = /\b(day\s*block|focus\s*time|block\s*time|prep\s*block|prep\b|hold|blocked|do\s*not\s*book|dnb|no\s*meetings|lunch|break|commute|travel\s*time|personal|buffer)\b/i;

export function isNoiseTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  if (NOISE_PATTERN.test(title)) return true;
  const lower = title.toLowerCase();
  return NOISE_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Classification ────────────────────────────────────────────────────

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

/** Bucket label compatible with legacy causality_findings.signal_summary store. */
export function classifyEventBucket(title: string | null | undefined): string | null {
  return classifyEvent(title)?.bucket ?? null;
}

// Legacy-compatible EVENT_TYPE_KEYWORDS (cause-effect-engine + smart-nudges
// previously each kept their own copy). Order preserved.
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

// ── Stakes Score (Section I) ──────────────────────────────────────────

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

// ── Lead-event selection (Section I) ──────────────────────────────────

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
  const att = e.attendees_count ?? 0;
  const start = new Date(e.start_time);
  const end = e.end_time ? new Date(e.end_time) : new Date(start.getTime() + 30 * 60000);
  const dur = (end.getTime() - start.getTime()) / 60000;
  if (PERSONAL_BLOCK_PATTERN.test(e.title || '')) return false;
  if (dur > 240 && att <= 1) return false; // calendar blocker, not a meeting
  if (e.is_recurring && att <= 2 && dur < 45) return false; // routine recurring
  return att >= 2 || dur >= 30;
}

export function scoreEvents<E extends CalendarEventLite>(events: E[], flags?: EngineFlags): ScoredEvent<E>[] {
  return events.map((e) => {
    const t = classifyEvent(e.title);
    return { event: e, type: t, stakes: t ? stakesScore(t, flags) : 0 };
  });
}

/** Lead-event selection (Brief NEXT UP, Smart-Nudges anchor, Mastery-Plan lead picker). */
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

// ── Logic Engines §2.18 – §2.23 ───────────────────────────────────────

export interface DayContext {
  events: CalendarEventLite[];
  yesterdayEvents?: CalendarEventLite[];
  recentDaysHighStakesCount?: number;
  poorRecovery?: boolean;
}

export function detectCognitiveFragmentation(events: CalendarEventLite[]): boolean {
  const sorted = events.filter(survivesAttendeeOrDurationFloor)
    .map((e) => ({ start: new Date(e.start_time).getTime(), end: new Date(e.end_time || e.start_time).getTime() }))
    .sort((a, b) => a.start - b.start);
  if (sorted.length < 5) {
    let small = 0;
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i].start - sorted[i - 1].end) / 60000 < 15) small++;
    }
    return small >= 3;
  }
  for (let i = 0; i + 4 < sorted.length; i++) {
    if ((sorted[i + 4].start - sorted[i].start) / 3600000 <= 6) return true;
  }
  return false;
}

export function detectVisibilityAccumulation(events: CalendarEventLite[]): boolean {
  const visEvents = events.map((e) => ({ e, t: classifyEvent(e.title) }))
    .filter((x) => x.t && x.t.group === 'D_visibility')
    .map((x) => new Date(x.e.start_time).getTime()).sort((a, b) => a - b);
  if (visEvents.length < 2) return false;
  for (let i = 1; i < visEvents.length; i++) {
    if ((visEvents[i] - visEvents[i - 1]) / 3600000 <= 48) return true;
  }
  return false;
}

export function detectEmotionalCarryover(events: CalendarEventLite[]): boolean {
  const enriched = events.map((e) => ({ e, t: classifyEvent(e.title) })).filter((x) => x.t)
    .sort((a, b) => new Date(a.e.start_time).getTime() - new Date(b.e.start_time).getTime());
  for (let i = 0; i < enriched.length; i++) {
    const cur = enriched[i];
    if (cur.t!.primaryPillar !== 3) continue;
    const curEnd = new Date(cur.e.end_time || cur.e.start_time).getTime();
    for (let j = i + 1; j < enriched.length; j++) {
      const next = enriched[j];
      const nextStart = new Date(next.e.start_time).getTime();
      if ((nextStart - curEnd) / 3600000 > 2) break;
      if (next.t!.primaryPillar === 3 || next.t!.primaryPillar === 2) return true;
    }
  }
  return false;
}

export function detectTravelCompression(events: CalendarEventLite[]): boolean {
  const enriched = events.map((e) => ({ e, t: classifyEvent(e.title) }));
  const hasFlight = enriched.some((x) => x.t && x.t.group === 'G_travel');
  if (!hasFlight) return false;
  return enriched.some((x) => x.t && stakesScore(x.t) >= 90);
}

export function detectExecutiveOverextension(ctx: DayContext): boolean {
  return (ctx.recentDaysHighStakesCount ?? 0) >= 3;
}

export function detectIdentityPressureSpike(ctx: DayContext): boolean {
  const enriched = ctx.events.map((e) => ({ e, t: classifyEvent(e.title) }));
  const hasVisibility = enriched.some((x) => x.t && x.t.group === 'D_visibility');
  const hasInvestorOrBoard = enriched.some((x) => x.t && (x.t.group === 'A_governance' || x.t.group === 'B_investor'));
  return hasVisibility && hasInvestorOrBoard && (ctx.poorRecovery === true);
}

export function evaluateAllEngines(ctx: DayContext): EngineFlags {
  return {
    cognitiveFragmentation: detectCognitiveFragmentation(ctx.events),
    visibilityAccumulation: detectVisibilityAccumulation(ctx.events),
    emotionalCarryover: detectEmotionalCarryover(ctx.events),
    travelCompression: detectTravelCompression(ctx.events),
    executiveOverextension: detectExecutiveOverextension(ctx),
    identityPressureSpike: detectIdentityPressureSpike(ctx),
  };
}

// ── Morning / Evening Context (Section J) ────────────────────────────

export interface UserStateSnapshot {
  hrv?: number | null;
  rhr?: number | null;
  sleepScore?: number | null;
  mood?: number | null;
  energy?: number | null;
}

export interface MorningContext {
  loadTier: 'light' | 'moderate' | 'heavy' | 'crushing';
  dominantPillar: Pillar | null;
  leadEvent: ScoredEvent | null;
  topEvents: ScoredEvent[];
  engineFlags: EngineFlags;
  carryForward: string[];
  primaryObjective: RegulationObjective;
  pacingHints: string[];
}

export interface EveningContext {
  pillarOfTheDay: Pillar | null;
  carryingNow: string[];
  closeLoops: string[];
  tomorrowLeadEvent: ScoredEvent | null;
  tomorrowLoadTier: 'light' | 'moderate' | 'heavy' | 'crushing';
  primaryObjective: RegulationObjective;
  isSundayPrep: boolean;
}

function tierFromCount(n: number): 'light' | 'moderate' | 'heavy' | 'crushing' {
  if (n <= 2) return 'light';
  if (n <= 4) return 'moderate';
  if (n <= 6) return 'heavy';
  return 'crushing';
}

function dominantPillarOf(scored: ScoredEvent[]): Pillar | null {
  if (scored.length === 0) return null;
  const tally: Record<number, number> = {};
  for (const s of scored) {
    if (!s.type) continue;
    tally[s.type.primaryPillar] = (tally[s.type.primaryPillar] ?? 0) + s.stakes;
  }
  const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  return entries.length ? (Number(entries[0][0]) as Pillar) : null;
}

export function buildMorningContext(
  state: UserStateSnapshot,
  todayEvents: CalendarEventLite[],
  yesterdayCarry: string[] = [],
  recentDaysHighStakesCount: number = 0,
): MorningContext {
  const poorRecovery =
    (state.sleepScore != null && state.sleepScore < 60) ||
    (state.energy != null && state.energy <= 2);
  const ctx: DayContext = { events: todayEvents, recentDaysHighStakesCount, poorRecovery };
  const flags = evaluateAllEngines(ctx);
  const candidates = todayEvents.filter((e) => !isNoiseTitle(e.title)).filter(survivesAttendeeOrDurationFloor);
  const scored = scoreEvents(candidates, flags).sort((a, b) => b.stakes - a.stakes);
  const lead = selectLeadEvent(todayEvents, flags);
  const dominant = dominantPillarOf(scored);

  let objective: RegulationObjective = 'PREPARE';
  if (flags.cognitiveFragmentation || flags.executiveOverextension) objective = 'PROTECT';
  else if (flags.visibilityAccumulation || flags.emotionalCarryover || flags.identityPressureSpike) objective = 'PREVENT';

  const pacingHints: string[] = [];
  if (flags.cognitiveFragmentation) pacingHints.push('insert micro-resets between back-to-backs');
  if (flags.emotionalCarryover) pacingHints.push('add a decompression bridge after the P3 event');
  if (flags.travelCompression) pacingHints.push('hydrate + circadian anchor before high-stakes window');

  return {
    loadTier: tierFromCount(candidates.length),
    dominantPillar: dominant,
    leadEvent: lead,
    topEvents: scored.slice(0, 3),
    engineFlags: flags,
    carryForward: yesterdayCarry,
    primaryObjective: objective,
    pacingHints,
  };
}

export function buildEveningContext(
  todayEvents: CalendarEventLite[],
  tomorrowEvents: CalendarEventLite[],
  openLoops: string[] = [],
  isSundayPrep: boolean = false,
): EveningContext {
  const todayCandidates = todayEvents.filter((e) => !isNoiseTitle(e.title)).filter(survivesAttendeeOrDurationFloor);
  const todayScored = scoreEvents(todayCandidates).sort((a, b) => b.stakes - a.stakes);
  const pillarOfTheDay = dominantPillarOf(todayScored);

  const carryingNow: string[] = [];
  const totals: Record<DemandDim, number> = { cog: 0, emo: 0, vis: 0, pol: 0, rel: 0, ene: 0, cir: 0, id: 0 };
  for (const s of todayScored) {
    if (!s.type) continue;
    for (const k of Object.keys(totals) as DemandDim[]) totals[k] += s.type.demandProfile[k];
  }
  if (totals.cog >= 4) carryingNow.push('cognitive load');
  if (totals.emo >= 4) carryingNow.push('emotional residue');
  if (totals.id >= 4) carryingNow.push('identity pressure');
  if (totals.vis >= 4) carryingNow.push('post-visibility activation');

  const tmrLead = selectLeadEvent(tomorrowEvents);
  const tmrCandidates = tomorrowEvents.filter((e) => !isNoiseTitle(e.title)).filter(survivesAttendeeOrDurationFloor);

  const closeLoops = [...openLoops];
  for (const s of todayScored) {
    if (s.type && s.type.primaryPillar === 3 && s.type.timingMatrix.postMandatory) {
      closeLoops.push(`Close: ${s.type.label}`);
    }
  }

  let objective: RegulationObjective = 'RECOVER';
  if (tmrLead && tmrLead.stakes >= 90) objective = 'PREVENT';

  return {
    pillarOfTheDay,
    carryingNow,
    closeLoops,
    tomorrowLeadEvent: tmrLead,
    tomorrowLoadTier: tierFromCount(tmrCandidates.length),
    primaryObjective: objective,
    isSundayPrep,
  };
}

// ── Day-kind detection ────────────────────────────────────────────────

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
