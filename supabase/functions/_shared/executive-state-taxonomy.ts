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
  /**
   * CEO Self-Regulation Framework pillar (A–H). Single source of truth used by
   * Smart Nudges, Mastery Plan, JIT, and the Insights cause-effect card.
   * Existing `group` codes are preserved for backwards-compat with downstream
   * mappings; `frameworkPillar` is the canonical taxonomy going forward.
   */
  frameworkPillar: FrameworkPillar;
  primaryPillar: Pillar;
  secondaryPillar?: Pillar;
  demandProfile: DemandProfile;
  timingMatrix: TimingMatrix;
  regulationObjective: RegulationObjective;
  interventionType: InterventionType;
  keywords: string[];
  masteryModules?: string[];
  jitLeadTimeMinutes?: number;
  /**
   * If true, the event is classified for visibility (Insights labels) but
   * never triggers JIT, nudges, or mastery slots. Used for Networking events
   * — the user is between chats; no in-app exercise is appropriate.
   */
  classificationOnly?: boolean;
}

// ── Framework Pillars (CEO Self-Regulation Framework v1) ──────────────
// Eight pillars that drive the single-source taxonomy. Bucket labels on
// EventType match these names so the Insights cause-effect card surfaces
// them verbatim.

export type FrameworkPillar = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export interface FrameworkPillarMeta {
  id: FrameworkPillar;
  name: string;
  focus: string;
  /** Pre/During/Post protocol contract for this pillar (MVP, self-regulation). */
  protocol: {
    pre: InterventionType | null;
    during: InterventionType | null;
    post: InterventionType | null;
    /** True when DURING is delivered as a notification reminder only — no in-app exercise. */
    duringNotificationOnly?: boolean;
  };
}

export const FRAMEWORK_PILLARS: Record<FrameworkPillar, FrameworkPillarMeta> = {
  A: { id: 'A', name: 'High-Stakes Governance',           focus: 'Emotional regulation + cognitive sharpness',         protocol: { pre: 'Flow',       during: null,    post: 'Pause' } },
  B: { id: 'B', name: 'Influence & Persuasion',           focus: 'Focus activation + post-persuasion recharge',         protocol: { pre: 'Flow',       during: null,    post: 'Reenergise' } },
  C: { id: 'C', name: 'Visibility & Communication',       focus: 'Presence + composure',                                protocol: { pre: 'Pause',      during: null,    post: 'Reenergise' } },
  D: { id: 'D', name: 'People & Difficult Conversations', focus: 'Emotional labour + post-conversation offload',        protocol: { pre: 'Pause',      during: null,    post: 'Pause' } },
  E: { id: 'E', name: 'Deep Work & Strategy',             focus: 'Flow activation + clean exit',                        protocol: { pre: 'Flow',       during: 'Flow',  post: 'Pause' } },
  F: { id: 'F', name: 'Conferences & External Events',    focus: 'Pre-event social/emotional load priming; during = notification reminder only; post = depletion recovery', protocol: { pre: 'Pause', during: 'Pause', post: 'Reenergise', duringNotificationOnly: true } },
  G: { id: 'G', name: 'Travel',                            focus: 'Circadian regulation + pre-event readiness',          protocol: { pre: 'Pause',      during: 'Pause', post: 'Reenergise' } },
  H: { id: 'H', name: 'Daily Rhythm & Baseline',           focus: 'Habit anchoring + recovery-to-build',                 protocol: { pre: 'Pause',      during: null,    post: 'Pause' } },
};

/** Convenience accessor used by callers that want the pillar's protocol contract. */
export function getFrameworkPillarProtocol(p: FrameworkPillar): FrameworkPillarMeta['protocol'] {
  return FRAMEWORK_PILLARS[p].protocol;
}

// ── Master Taxonomy Table ─────────────────────────────────────────────

export const EVENT_TYPES: EventType[] = [
  // ── Pillar A · High-Stakes Governance ──
  { id:'gov.board_meeting',    label:'Board meeting',         bucket:'High-Stakes Governance', frameworkPillar:'A', group:'A_governance', primaryPillar:1, secondaryPillar:2, demandProfile:D(3,1,3,3,1,2,0,3), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['board meeting','board of directors','board'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:1440 },
  { id:'gov.board_committee',  label:'Board committee',       bucket:'High-Stakes Governance', frameworkPillar:'A', group:'A_governance', primaryPillar:1, secondaryPillar:2, demandProfile:D(3,1,2,3,1,1,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['audit committee','remco','nomco','board committee','governance'] },
  { id:'gov.board_prep',       label:'Board prep',            bucket:'High-Stakes Governance', frameworkPillar:'A', group:'A_governance', primaryPillar:1, demandProfile:D(3,0,1,2,0,1,0,1), timingMatrix:{pre:false,during:false,post:false}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['board deck','board prep','board presentation','board materials'], masteryModules:['align','prepare'], jitLeadTimeMinutes:2880 },
  { id:'gov.investor_meeting', label:'Investor meeting',      bucket:'High-Stakes Governance', frameworkPillar:'A', group:'B_investor', primaryPillar:2, secondaryPillar:1, demandProfile:D(2,2,3,2,1,2,0,3), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['investor','vc ',' vc','lp meeting','limited partner'], masteryModules:['regulate','prepare'], jitLeadTimeMinutes:1440 },
  { id:'gov.earnings_call',    label:'Earnings call',         bucket:'High-Stakes Governance', frameworkPillar:'A', group:'B_investor', primaryPillar:2, secondaryPillar:1, demandProfile:D(3,1,3,2,0,2,0,3), timingMatrix:{pre:true,during:false,post:true,postMandatory:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['earnings call','earnings'] },
  { id:'gov.qbr',              label:'QBR / Quarterly review',bucket:'High-Stakes Governance', frameworkPillar:'A', group:'C_strategic', primaryPillar:1, secondaryPillar:4, demandProfile:D(3,1,2,2,2,2,0,2), timingMatrix:{pre:true,during:true,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['quarterly','qbr','q1 review','q2 review','q3 review','q4 review'], masteryModules:['align','prepare'], jitLeadTimeMinutes:2880 },
  { id:'gov.budget_review',    label:'Budget / forecast review', bucket:'High-Stakes Governance', frameworkPillar:'A', group:'B_investor', primaryPillar:1, demandProfile:D(3,1,1,2,1,1,0,1), timingMatrix:{pre:true,during:false,post:false}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['budget','finance review','forecast','financial planning'], masteryModules:['align','prepare'], jitLeadTimeMinutes:1440 },
  { id:'gov.ma_discussion',    label:'M&A discussion',        bucket:'High-Stakes Governance', frameworkPillar:'A', group:'B_investor', primaryPillar:1, secondaryPillar:2, demandProfile:D(3,2,2,3,1,2,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['m&a','merger','acquisition','due diligence','acqui-hire'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:2880 },
  { id:'gov.crisis',           label:'Crisis / Incident',     bucket:'High-Stakes Governance', frameworkPillar:'A', group:'F_operational', primaryPillar:4, secondaryPillar:3, demandProfile:D(3,3,2,2,2,3,0,2), timingMatrix:{pre:false,during:true,post:true,postMandatory:true}, regulationObjective:'PROTECT', interventionType:'Pause', keywords:['crisis','urgent','emergency','incident','escalation'], masteryModules:['regulate'], jitLeadTimeMinutes:120 },

  // ── Pillar B · Influence & Persuasion ──
  { id:'inf.fundraising',      label:'Fundraising / Pitch',   bucket:'Influence & Persuasion', frameworkPillar:'B', group:'B_investor', primaryPillar:2, secondaryPillar:1, demandProfile:D(2,2,3,2,1,3,0,3), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['fundraise','fundraising','raise','pitch deck','pitch','funding'] },
  { id:'inf.negotiation',      label:'Negotiation',           bucket:'Influence & Persuasion', frameworkPillar:'B', group:'E_leadership', primaryPillar:2, secondaryPillar:3, demandProfile:D(2,2,1,3,2,2,0,1), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['negotiation','contract','deal terms','partnership terms'], masteryModules:['regulate','prepare'], jitLeadTimeMinutes:720 },
  { id:'inf.client_presentation', label:'Client / customer presentation', bucket:'Influence & Persuasion', frameworkPillar:'B', group:'D_visibility', primaryPillar:2, secondaryPillar:1, demandProfile:D(2,1,2,1,2,2,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['client','customer','demo','proposal','account review','stakeholder'], masteryModules:['align','prepare'], jitLeadTimeMinutes:480 },

  // ── Pillar C · Visibility & Communication (internal-comms; external speaking moves to F) ──
  { id:'vis.media',            label:'Media / Press / Podcast', bucket:'Visibility & Communication', frameworkPillar:'C', group:'D_visibility', primaryPillar:2, demandProfile:D(2,1,3,1,1,2,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['media interview','press interview','podcast interview','podcast','media','press','journalist','pr '], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:360 },
  { id:'vis.all_hands',        label:'All-hands / Town hall', bucket:'Visibility & Communication', frameworkPillar:'C', group:'D_visibility', primaryPillar:2, secondaryPillar:3, demandProfile:D(1,2,3,1,2,2,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['all-hands','all hands','town hall','townhall','company meeting'], masteryModules:['regulate','align'], jitLeadTimeMinutes:240 },

  // ── Pillar D · People & Difficult Conversations ──
  // NOTE: 1:1 with boss/peer/junior cannot be reliably detected from titles
  // (titles are often just attendee names). Out of scope for MVP — see plan.
  { id:'lead.executive_1on1',  label:'Executive 1:1',         bucket:'People & Difficult Conversations', frameworkPillar:'D', group:'E_leadership', primaryPillar:3, demandProfile:D(1,2,1,1,3,1,0,1), timingMatrix:{pre:false,during:false,post:false}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['1:1','1-1','one on one','1on1'] },
  { id:'lead.leadership_sync', label:'Leadership / Exec team sync', bucket:'People & Difficult Conversations', frameworkPillar:'D', group:'E_leadership', primaryPillar:3, secondaryPillar:1, demandProfile:D(2,1,1,2,2,1,0,1), timingMatrix:{pre:true,during:false,post:false}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['leadership team','exec team','c-suite','slt','management meeting','leadership','exec ',' exec','executive','ceo ',' ceo','cto ',' cto'], masteryModules:['regulate','align'], jitLeadTimeMinutes:240 },
  { id:'lead.performance_review', label:'Performance review', bucket:'People & Difficult Conversations', frameworkPillar:'D', group:'E_leadership', primaryPillar:3, secondaryPillar:1, demandProfile:D(2,3,1,2,3,2,0,2), timingMatrix:{pre:true,during:false,post:true,postMandatory:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['performance review','annual review','mid-year review','360 feedback','360 review'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:480 },
  { id:'lead.difficult_conversation', label:'Difficult conversation / Escalation', bucket:'People & Difficult Conversations', frameworkPillar:'D', group:'E_leadership', primaryPillar:3, demandProfile:D(1,3,1,2,3,2,0,1), timingMatrix:{pre:true,during:false,post:true,postMandatory:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['difficult','feedback','pip','conflict','dispute','tension','confrontation','escalation'], masteryModules:['regulate','prepare'], jitLeadTimeMinutes:240 },
  { id:'lead.layoff',          label:'Layoff / Restructure',  bucket:'People & Difficult Conversations', frameworkPillar:'D', group:'E_leadership', primaryPillar:3, secondaryPillar:2, demandProfile:D(1,3,2,2,3,2,0,2), timingMatrix:{pre:true,during:false,post:true,postMandatory:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['layoff','restructuring','restructure','reduction','rif','downsizing','termination'], masteryModules:['regulate','prepare'], jitLeadTimeMinutes:1440 },
  // Job interviews — own interview OR conducting one. NOT media interviews.
  { id:'lead.hiring_committee',label:'Job interview / Hiring committee', bucket:'People & Difficult Conversations', frameworkPillar:'D', group:'E_leadership', primaryPillar:3, secondaryPillar:1, demandProfile:D(2,1,1,1,2,1,0,1), timingMatrix:{pre:true,during:false,post:false}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['job interview','final round interview','screening interview','final round','hiring committee','offer discussion','executive hire','candidate','interview'], masteryModules:['align','prepare'], jitLeadTimeMinutes:240 },

  // ── Pillar E · Deep Work & Strategy ──
  { id:'str.strategy_planning',label:'Strategy planning',     bucket:'Deep Work & Strategy', frameworkPillar:'E', group:'C_strategic', primaryPillar:1, demandProfile:D(3,0,1,1,1,1,0,1), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['strategy','strategic planning','vision','roadmap','annual operating plan','3-year plan','3 year plan'], masteryModules:['align','prepare'], jitLeadTimeMinutes:1440 },
  { id:'str.deep_work',        label:'Deep work block',       bucket:'Deep Work & Strategy', frameworkPillar:'E', group:'C_strategic', primaryPillar:1, demandProfile:D(3,0,0,0,0,1,0,0), timingMatrix:{pre:false,during:true,post:false}, regulationObjective:'PROTECT', interventionType:'Flow', keywords:['deep work','focus block','writing time'] },
  { id:'str.product_launch',   label:'Product launch / Go-live', bucket:'Deep Work & Strategy', frameworkPillar:'E', group:'F_operational', primaryPillar:4, secondaryPillar:2, demandProfile:D(2,2,2,1,2,3,0,2), timingMatrix:{pre:true,during:true,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['launch','go live','release','ship','product launch'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:1440 },

  // ── Pillar F · Conferences & External Events ──
  // Protocol contract: PRE = Pause (social/emotional load priming).
  // DURING = notification reminder only (no in-app exercise — user is between
  // chats). POST = Reenergise (social-depletion recovery). See FRAMEWORK_PILLARS.F.
  { id:'conf.keynote',         label:'Keynote',               bucket:'Conferences & External Events', frameworkPillar:'F', group:'D_visibility', primaryPillar:2, demandProfile:D(1,1,3,1,0,3,0,3), timingMatrix:{pre:true,during:false,post:true,postMandatory:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['keynote'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:720 },
  { id:'conf.speaking',        label:'Conference speaking / Panel', bucket:'Conferences & External Events', frameworkPillar:'F', group:'D_visibility', primaryPillar:2, demandProfile:D(1,1,3,1,0,2,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['conference','summit','panel discussion','panel','roundtable','fireside','speaking','webinar'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:720 },
  { id:'conf.offsite',         label:'Off-site / Retreat',    bucket:'Conferences & External Events', frameworkPillar:'F', group:'D_visibility', primaryPillar:2, secondaryPillar:3, demandProfile:D(2,2,2,1,3,3,0,1), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['offsite','off-site','retreat'], masteryModules:['regulate','align'], jitLeadTimeMinutes:720 },
  { id:'conf.award',           label:'Award / Recognition event', bucket:'Conferences & External Events', frameworkPillar:'F', group:'D_visibility', primaryPillar:2, demandProfile:D(1,1,3,0,1,2,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['award','recognition event','awards ceremony','gala'] },
  { id:'conf.customer_summit', label:'Customer / partner summit', bucket:'Conferences & External Events', frameworkPillar:'F', group:'D_visibility', primaryPillar:2, secondaryPillar:3, demandProfile:D(2,1,2,1,3,3,0,2), timingMatrix:{pre:true,during:false,post:true,postMandatory:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['customer summit','partner summit','user conference'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:720 },
  // Networking event — classification-only. No JIT, no nudges, no mastery.
  { id:'conf.networking',      label:'Networking event',      bucket:'Conferences & External Events', frameworkPillar:'F', group:'D_visibility', primaryPillar:2, demandProfile:D(0,1,1,0,2,1,0,0), timingMatrix:{pre:false,during:false,post:false}, regulationObjective:'PROTECT', interventionType:'Pause', keywords:['networking event','networking dinner','networking drinks','meetup','mixer'], classificationOnly:true },

  // ── Pillar G · Travel ──
  { id:'trv.long_haul',        label:'Long-haul flight',      bucket:'Travel', frameworkPillar:'G', group:'G_travel', primaryPillar:4, secondaryPillar:5, demandProfile:D(1,1,0,0,0,3,3,0), timingMatrix:{pre:true,during:true,post:true,postMandatory:true}, regulationObjective:'PROTECT', interventionType:'Pause', keywords:['long-haul','long haul','red-eye','redeye','overnight flight'] },
  { id:'trv.flight',           label:'Flight / Travel',       bucket:'Travel', frameworkPillar:'G', group:'G_travel', primaryPillar:4, secondaryPillar:5, demandProfile:D(1,1,0,0,0,2,2,0), timingMatrix:{pre:true,during:true,post:true}, regulationObjective:'PROTECT', interventionType:'Pause', keywords:['flight','airport','boarding','departure','arrival','layover','transit'] },

  // ── Pillar H · Daily Rhythm & Baseline ──
  { id:'rhy.catchup',          label:'Catch-up / Sync',       bucket:'Daily Rhythm & Baseline', frameworkPillar:'H', group:'F_operational', primaryPillar:4, demandProfile:D(1,1,0,0,2,1,0,0), timingMatrix:{pre:false,during:false,post:false}, regulationObjective:'PROTECT', interventionType:'Pause', keywords:['catchup','catch-up','catch up','sync','check-in','check in','weekly','standup','stand-up'] },
  { id:'rhy.pto',              label:'PTO / Time off',        bucket:'Daily Rhythm & Baseline', frameworkPillar:'H', group:'H_recovery', primaryPillar:5, demandProfile:D(0,0,0,0,0,0,0,1), timingMatrix:{pre:false,during:false,post:false}, regulationObjective:'RECOVER', interventionType:'Pause', keywords:['out of office','ooo','annual leave','holiday','vacation','pto','day off','away'] },
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
  if (PERSONAL_BLOCK_PATTERN.test(title)) return true;
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
  // Keyword-first gate (per CEO-block reality):
  //   - Personal/admin blocks (lunch, commute, travel-time placeholder) drop.
  //   - Any title that classifies to a canonical EVENT_TYPE survives, regardless
  //     of attendee count or duration. A 0-attendee 60-min "Media Interview – CNN"
  //     or an 8-hour "Travel – LHR→JFK" still counts; attendee count is reserved
  //     for future relational features (role-play), not selection gating.
  //   - Otherwise apply a soft floor: drop only obvious micro-noise.
  const title = e.title || '';
  if (PERSONAL_BLOCK_PATTERN.test(title)) return false;
  if (classifyEvent(title)) return true;
  const att = e.attendees_count ?? 0;
  const start = new Date(e.start_time);
  const end = e.end_time ? new Date(e.end_time) : new Date(start.getTime() + 30 * 60000);
  const dur = (end.getTime() - start.getTime()) / 60000;
  if (dur < 15 && att === 0) return false; // micro-block, almost certainly noise
  return true;
}

/**
 * Soft attendee tier — NOT used for selection gating today. Surfaced on
 * ScoredEvent so future relational features (role-play, navigation drills)
 * can consume it without re-deriving from attendees_count.
 */
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

// ── Cross-provider dedupe ────────────────────────────────────────────
//
// The same logical meeting can land in `calendar_events` once per provider
// (e.g. an Apple-mirrored Google meeting). All downstream selectors —
// brief, signal pills, plan, nudges, JIT, cause/effect — must operate on
// a single canonical event per (start_time, normalized_title).
//
// Preference order when collapsing duplicates:
//   1. richer metadata (more attendees, organizer flag)
//   2. Google > Microsoft > Apple (Apple is usually a mirror)
//   3. earliest created_at (stable tiebreak)

const PROVIDER_RANK: Record<string, number> = {
  google: 3,
  microsoft: 2,
  outlook: 2,
  apple: 1,
};

// Platform-aware provider ranks. iOS native treats Apple as the source of
// truth (it already aggregates Google/MS calendars on the device). Web has
// no aggregation layer, so Google/MS win and Apple is shown as connected
// but de-prioritised in selection.
const PROVIDER_RANK_BY_PLATFORM: Record<string, Record<string, number>> = {
  ios:     { apple: 3, google: 2, microsoft: 1, outlook: 1 },
  web:     { google: 3, microsoft: 2, outlook: 2, apple: 1 },
  unknown: { google: 3, microsoft: 2, outlook: 2, apple: 1 },
};

function normalizeTitle(t: string | null | undefined): string {
  return (t || '')
    .toLowerCase()
    .replace(/[\s\-_/\\.,:;!?'"()\[\]]+/g, ' ')
    .trim();
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

/**
 * Collapse cross-provider duplicate calendar events.
 * Key = `${normalizedTitle}|${startMs}`. Falls back to (title|startMs) only.
 * Empty title events are kept as-is (cannot dedupe without a name).
 */
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
    if (!title || !startMs) {
      untitled.push(e);
      continue;
    }
    const key = `${title}|${startMs}`;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, e);
      continue;
    }
    if (preferEvent(e, existing, rank)) buckets.set(key, e);
  }

  return [...buckets.values(), ...untitled];
}

function preferEvent<T extends DedupableEvent>(
  candidate: T,
  current: T,
  rank: Record<string, number> = PROVIDER_RANK,
): boolean {
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

// ── EVENT_TYPE → mastery scenarioId ───────────────────────────────────
//
// One-way mapping consumed by generate-mastery-plan to look up its bespoke
// ExecutiveScenario (which carries ModuleSpecs) deterministically off the
// shared taxonomy. Multiple EVENT_TYPE ids may fold into one scenario.
// `null` is intentional — no prep scenario applies (e.g. deep work, 1:1).
export const EVENT_TYPE_TO_SCENARIO_ID: Record<string, string | null> = {
  // Pillar A
  'gov.board_meeting':           'pre-board-meeting',
  'gov.board_committee':         'pre-board-meeting',
  'gov.board_prep':              'pre-board-meeting',
  'gov.investor_meeting':        'pre-investor-meeting',
  'gov.earnings_call':           'pre-budget-review',
  'gov.qbr':                     'pre-quarterly-review',
  'gov.budget_review':           'pre-budget-review',
  'gov.ma_discussion':           'pre-negotiations',
  'gov.crisis':                  'pre-crisis-response',
  // Pillar B
  'inf.fundraising':             'pre-investor-meeting',
  'inf.negotiation':             'pre-negotiations',
  'inf.client_presentation':     'pre-client-presentation',
  // Pillar C
  'vis.media':                   'pre-media',
  'vis.all_hands':               'pre-all-hands',
  // Pillar D
  'lead.executive_1on1':         null,
  'lead.leadership_sync':        'pre-all-hands',
  'lead.performance_review':     'pre-performance-review',
  'lead.difficult_conversation': 'pre-difficult-conversation',
  'lead.layoff':                 'pre-difficult-conversation',
  'lead.hiring_committee':       'pre-hiring-decision',
  // Pillar E
  'str.strategy_planning':       'pre-strategic-planning',
  'str.deep_work':               null,
  'str.product_launch':          'pre-strategic-planning',
  // Pillar F — Conferences & External Events
  'conf.keynote':                'pre-speaking-engagement',
  'conf.speaking':                'pre-speaking-engagement',
  'conf.offsite':                 'pre-strategic-planning',
  'conf.award':                   'pre-speaking-engagement',
  'conf.customer_summit':         'pre-speaking-engagement',
  'conf.networking':              null, // classification-only — no JIT/scenario
  // Pillar G
  'trv.long_haul':               null,
  'trv.flight':                  null,
  // Pillar H
  'rhy.catchup':                 null,
  'rhy.pto':                     null,
};

export function scenarioIdFor(title: string | null | undefined): string | null {
  const et = classifyEvent(title);
  if (!et) return null;
  return EVENT_TYPE_TO_SCENARIO_ID[et.id] ?? null;
}

// ── Stacking: consolidate adjacent high-stakes events ─────────────────
//
// MVP rule (self-regulation only):
//   When two pillar A or D high-stakes events sit back-to-back (gap < 90
//   minutes), surface ONE consolidated JIT covering both rather than two
//   separate protocols. Caller is expected to render one Pause+Flow
//   practice that names both events.
//
// When a future feature set introduces other meta-skills, this rule should
// be revisited so distinct features can drive separate JITs.

export interface StackedEventGroup<E extends CalendarEventLite = CalendarEventLite> {
  events: ScoredEvent<E>[];
  consolidated: boolean;
  primaryPillar: FrameworkPillar | null;
}

const HIGH_STAKES_PILLARS: FrameworkPillar[] = ['A', 'D'];
const STACK_GAP_MINUTES = 90;

export function consolidateAdjacentHighStakes<E extends CalendarEventLite>(
  events: E[],
  flags?: EngineFlags,
): StackedEventGroup<E>[] {
  const scored = scoreEvents(
    events.filter((e) => !isNoiseTitle(e.title)).filter(survivesAttendeeOrDurationFloor),
    flags,
  )
    .filter((s) => s.type && !s.type.classificationOnly)
    .sort((a, b) => new Date(a.event.start_time).getTime() - new Date(b.event.start_time).getTime());

  const groups: StackedEventGroup<E>[] = [];
  for (const s of scored) {
    const pillar = s.type!.frameworkPillar;
    const isHighStakes = HIGH_STAKES_PILLARS.includes(pillar);
    const last = groups[groups.length - 1];
    if (!last || !isHighStakes) {
      groups.push({ events: [s], consolidated: false, primaryPillar: pillar });
      continue;
    }
    const lastEv = last.events[last.events.length - 1];
    const lastEnd = new Date(lastEv.event.end_time || lastEv.event.start_time).getTime();
    const curStart = new Date(s.event.start_time).getTime();
    const gapMin = (curStart - lastEnd) / 60000;
    const lastIsHighStakes = last.primaryPillar && HIGH_STAKES_PILLARS.includes(last.primaryPillar);
    if (lastIsHighStakes && gapMin < STACK_GAP_MINUTES) {
      last.events.push(s);
      last.consolidated = true;
      continue;
    }
    groups.push({ events: [s], consolidated: false, primaryPillar: pillar });
  }
  return groups;
}
