// OWNERSHIP: coaching (subtype rows + keywords) + engineering (types).
// Granular CEO event subtypes — the 30 canonical rows that power JIT lead
// times, mastery scenario routing, demand-dimension scoring and intervention
// type per subtype. Each row references a category from ./event-categories.ts
// via `categoryId` (= the §3 framework pillar A–H).

import type { EventCategoryId, InterventionType } from "./event-categories.ts";

// ── Layer 1: Priority-state pillars (1–5) ─────────────────────────────
// Distinct axis from A–H. Engines (state-engines.ts) use these to score
// stakes and dominant-pillar. Kept on subtypes because the engine math
// depends on them.

export type Pillar = 1 | 2 | 3 | 4 | 5;

export interface PillarMeta {
  id: Pillar;
  name: string;
  priorityState: string;
  risks: string[];
  baseWeight: number;
}

export const PILLAR_META: Record<Pillar, PillarMeta> = {
  1: { id: 1, name: 'Strategic Cognition', priorityState: 'Flow + Clarity', risks: ['decision leakage','cognitive overload','narrowed thinking','fatigue-driven simplification'], baseWeight: 60 },
  2: { id: 2, name: 'Executive Presence & Influence', priorityState: 'Activated Calm', risks: ['adrenaline overshoot','emotional hijack','performance anxiety','vocal/cognitive fatigue'], baseWeight: 70 },
  3: { id: 3, name: 'Emotional Load & Leadership Labor', priorityState: 'Regulated Presence', risks: ['emotional leakage','compassion fatigue','suppression debt','irritability carry-over'], baseWeight: 65 },
  4: { id: 4, name: 'Operational Pressure & Execution', priorityState: 'Controlled Output', risks: ['attentional fragmentation','NS overload','stress accumulation','reactive lock'], baseWeight: 40 },
  5: { id: 5, name: 'Recovery & Reintegration', priorityState: 'Downregulation + Reset', risks: ['post-adrenaline crash','emotional residue','sleep disruption','cognitive fatigue debt'], baseWeight: 0 },
};

// ── Demand profile ────────────────────────────────────────────────────

export type DemandDim = 'cog' | 'emo' | 'vis' | 'pol' | 'rel' | 'ene' | 'cir' | 'id';
export type DemandProfile = Record<DemandDim, 0 | 1 | 2 | 3>;

const D = (cog: number, emo: number, vis: number, pol: number, rel: number, ene: number, cir: number, id: number): DemandProfile =>
  ({ cog, emo, vis, pol, rel, ene, cir, id }) as DemandProfile;

export function demandSum(p: DemandProfile): number {
  return p.cog + p.emo + p.vis + p.pol + p.rel + p.ene + p.cir + p.id;
}

// ── Subtype shape ─────────────────────────────────────────────────────

export type EventGroup = 'A_governance' | 'B_investor' | 'C_strategic' | 'D_visibility'
  | 'E_leadership' | 'F_operational' | 'G_travel' | 'H_recovery';

export type RegulationObjective = 'PREPARE' | 'PREVENT' | 'PROTECT' | 'RECOVER';

export interface TimingMatrix { pre: boolean; during: boolean; post: boolean; postMandatory?: boolean }

export interface EventType {
  id: string;
  label: string;
  /** Bucket label compatible with causality_findings.signal_summary store. */
  bucket: string;
  /** Legacy group code preserved for backwards-compat with downstream maps. */
  group: EventGroup;
  /**
   * Canonical category (A–H) from ./event-categories.ts. New name for what
   * was `frameworkPillar` — both fields are populated for one release.
   */
  categoryId: EventCategoryId;
  /** @deprecated Use categoryId. Kept for backwards-compat. */
  frameworkPillar: EventCategoryId;
  primaryPillar: Pillar;
  secondaryPillar?: Pillar;
  demandProfile: DemandProfile;
  timingMatrix: TimingMatrix;
  regulationObjective: RegulationObjective;
  interventionType: InterventionType;
  keywords: string[];
  masteryModules?: string[];
  jitLeadTimeMinutes?: number;
  /** Classification-only — no JIT, nudges or mastery (e.g. Networking). */
  classificationOnly?: boolean;
  /**
   * Optional v2-only field. Substring tokens (lowercased) that, when present
   * in the title, disqualify a match on `keywords`. Honoured by
   * classify-event-v2's Layer 6 word-boundary dictionary match. The legacy
   * `classifyEvent` ignores it for backwards compatibility.
   */
  excludeKeywords?: string[];
}

// Helper to keep rows compact + auto-mirror categoryId/frameworkPillar.
type RawSubtype = Omit<EventType, 'frameworkPillar'> & { categoryId: EventCategoryId };
const ROWS: RawSubtype[] = [
  // ── Category A · High-Stakes Governance ──
  { id:'gov.board_meeting',    label:'Board meeting',         bucket:'High-Stakes Governance', categoryId:'A', group:'A_governance', primaryPillar:1, secondaryPillar:2, demandProfile:D(3,1,3,3,1,2,0,3), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['board meeting','board of directors','board'], excludeKeywords:['onboarding','off-boarding','offboarding','keyboard','cardboard','surfboard','dashboard','whiteboard','starboard','overboard','aboard'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:1440 },
  { id:'gov.board_committee',  label:'Board committee',       bucket:'High-Stakes Governance', categoryId:'A', group:'A_governance', primaryPillar:1, secondaryPillar:2, demandProfile:D(3,1,2,3,1,1,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['audit committee','remco','nomco','board committee','governance'] },
  { id:'gov.board_prep',       label:'Board prep',            bucket:'High-Stakes Governance', categoryId:'A', group:'A_governance', primaryPillar:1, demandProfile:D(3,0,1,2,0,1,0,1), timingMatrix:{pre:false,during:false,post:false}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['board deck','board prep','board presentation','board materials'], masteryModules:['align','prepare'], jitLeadTimeMinutes:2880 },
  // ── Additive row for v2 acronym dictionary ──
  { id:'gov.nonexec_board',    label:'Non-exec board / NED meeting', bucket:'High-Stakes Governance', categoryId:'A', group:'A_governance', primaryPillar:1, secondaryPillar:2, demandProfile:D(2,1,2,3,2,1,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['non-exec board','nonexec board','ned meeting','non-executive director'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:1440 },
  { id:'gov.investor_meeting', label:'Investor meeting',      bucket:'High-Stakes Governance', categoryId:'A', group:'B_investor', primaryPillar:2, secondaryPillar:1, demandProfile:D(2,2,3,2,1,2,0,3), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['investor','vc ',' vc','lp meeting','limited partner'], masteryModules:['regulate','prepare'], jitLeadTimeMinutes:1440 },
  { id:'gov.earnings_call',    label:'Earnings call',         bucket:'High-Stakes Governance', categoryId:'A', group:'B_investor', primaryPillar:2, secondaryPillar:1, demandProfile:D(3,1,3,2,0,2,0,3), timingMatrix:{pre:true,during:false,post:true,postMandatory:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['earnings call','earnings'] },
  { id:'gov.qbr',              label:'QBR / Quarterly review',bucket:'High-Stakes Governance', categoryId:'A', group:'C_strategic', primaryPillar:1, secondaryPillar:4, demandProfile:D(3,1,2,2,2,2,0,2), timingMatrix:{pre:true,during:true,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['quarterly','qbr','q1 review','q2 review','q3 review','q4 review'], masteryModules:['align','prepare'], jitLeadTimeMinutes:2880 },
  { id:'gov.budget_review',    label:'Budget / forecast review', bucket:'High-Stakes Governance', categoryId:'A', group:'B_investor', primaryPillar:1, demandProfile:D(3,1,1,2,1,1,0,1), timingMatrix:{pre:true,during:false,post:false}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['budget','finance review','forecast','financial planning'], masteryModules:['align','prepare'], jitLeadTimeMinutes:1440 },
  { id:'gov.ma_discussion',    label:'M&A discussion',        bucket:'High-Stakes Governance', categoryId:'A', group:'B_investor', primaryPillar:1, secondaryPillar:2, demandProfile:D(3,2,2,3,1,2,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['m&a','merger','acquisition','due diligence','acqui-hire'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:2880 },
  { id:'gov.crisis',           label:'Crisis / Incident',     bucket:'High-Stakes Governance', categoryId:'A', group:'F_operational', primaryPillar:4, secondaryPillar:3, demandProfile:D(3,3,2,2,2,3,0,2), timingMatrix:{pre:false,during:true,post:true,postMandatory:true}, regulationObjective:'PROTECT', interventionType:'Pause', keywords:['crisis','urgent','emergency','incident','escalation'], masteryModules:['regulate'], jitLeadTimeMinutes:120 },

  // ── Category B · Influence & Persuasion ──
  { id:'inf.fundraising',      label:'Fundraising / Pitch',   bucket:'Influence & Persuasion', categoryId:'B', group:'B_investor', primaryPillar:2, secondaryPillar:1, demandProfile:D(2,2,3,2,1,3,0,3), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['fundraise','fundraising','raise','pitch deck','pitch','funding'] },
  { id:'inf.negotiation',      label:'Negotiation',           bucket:'Influence & Persuasion', categoryId:'B', group:'E_leadership', primaryPillar:2, secondaryPillar:3, demandProfile:D(2,2,1,3,2,2,0,1), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['negotiation','contract','deal terms','partnership terms'], masteryModules:['regulate','prepare'], jitLeadTimeMinutes:720 },
  { id:'inf.client_presentation', label:'Client / customer presentation', bucket:'Influence & Persuasion', categoryId:'B', group:'D_visibility', primaryPillar:2, secondaryPillar:1, demandProfile:D(2,1,2,1,2,2,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['client','customer','demo','proposal','account review','stakeholder'], masteryModules:['align','prepare'], jitLeadTimeMinutes:480 },

  // ── Category C · Visibility & Communication ──
  { id:'vis.media',            label:'Media / Press / Podcast', bucket:'Visibility & Communication', categoryId:'C', group:'D_visibility', primaryPillar:2, demandProfile:D(2,1,3,1,1,2,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['media interview','press interview','podcast interview','podcast','media','press','journalist','pr '], excludeKeywords:['immediate','immediately','intermediate','social media','media query','impress','expression','depressed'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:360 },
  { id:'vis.all_hands',        label:'All-hands / Town hall', bucket:'Visibility & Communication', categoryId:'C', group:'D_visibility', primaryPillar:2, secondaryPillar:3, demandProfile:D(1,2,3,1,2,2,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Reenergise', keywords:['all-hands','all hands','town hall','townhall','company meeting'], masteryModules:['regulate','align'], jitLeadTimeMinutes:240 },

  // ── Category D · People & Difficult Conversations ──
  { id:'lead.executive_1on1',  label:'Executive 1:1',         bucket:'People & Difficult Conversations', categoryId:'D', group:'E_leadership', primaryPillar:3, demandProfile:D(1,2,1,1,3,1,0,1), timingMatrix:{pre:false,during:false,post:false}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['1:1','1-1','one on one','1on1'] },
  { id:'lead.leadership_sync', label:'Leadership / Exec team sync', bucket:'People & Difficult Conversations', categoryId:'D', group:'E_leadership', primaryPillar:3, secondaryPillar:1, demandProfile:D(2,1,1,2,2,1,0,1), timingMatrix:{pre:true,during:false,post:false}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['leadership team','exec team','c-suite','slt','management meeting','leadership','exec ',' exec','executive','ceo ',' ceo','cto ',' cto'], masteryModules:['regulate','align'], jitLeadTimeMinutes:240 },
  { id:'lead.performance_review', label:'Performance review', bucket:'People & Difficult Conversations', categoryId:'D', group:'E_leadership', primaryPillar:3, secondaryPillar:1, demandProfile:D(2,3,1,2,3,2,0,2), timingMatrix:{pre:true,during:false,post:true,postMandatory:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['performance review','annual review','mid-year review','360 feedback','360 review'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:480 },
  { id:'lead.difficult_conversation', label:'Difficult conversation / Escalation', bucket:'People & Difficult Conversations', categoryId:'D', group:'E_leadership', primaryPillar:3, demandProfile:D(1,3,1,2,3,2,0,1), timingMatrix:{pre:true,during:false,post:true,postMandatory:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['difficult','feedback','pip','conflict','dispute','tension','confrontation','escalation'], masteryModules:['regulate','prepare'], jitLeadTimeMinutes:240 },
  { id:'lead.layoff',          label:'Layoff / Restructure',  bucket:'People & Difficult Conversations', categoryId:'D', group:'E_leadership', primaryPillar:3, secondaryPillar:2, demandProfile:D(1,3,2,2,3,2,0,2), timingMatrix:{pre:true,during:false,post:true,postMandatory:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['layoff','restructuring','restructure','reduction','rif','downsizing','termination'], masteryModules:['regulate','prepare'], jitLeadTimeMinutes:1440 },
  { id:'lead.hiring_committee',label:'Job interview / Hiring committee', bucket:'People & Difficult Conversations', categoryId:'D', group:'E_leadership', primaryPillar:3, secondaryPillar:1, demandProfile:D(2,1,1,1,2,1,0,1), timingMatrix:{pre:true,during:false,post:false}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['job interview','final round interview','screening interview','final round','hiring committee','offer discussion','executive hire','candidate','interview'], masteryModules:['align','prepare'], jitLeadTimeMinutes:240 },

  // ── Category E · Deep Work & Strategy ──
  { id:'str.strategy_planning',label:'Strategy planning',     bucket:'Deep Work & Strategy', categoryId:'E', group:'C_strategic', primaryPillar:1, demandProfile:D(3,0,1,1,1,1,0,1), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['strategy','strategic planning','vision','roadmap','annual operating plan','3-year plan','3 year plan'], masteryModules:['align','prepare'], jitLeadTimeMinutes:1440 },
  { id:'str.deep_work',        label:'Deep work block',       bucket:'Deep Work & Strategy', categoryId:'E', group:'C_strategic', primaryPillar:1, demandProfile:D(3,0,0,0,0,1,0,0), timingMatrix:{pre:false,during:true,post:false}, regulationObjective:'PROTECT', interventionType:'Flow', keywords:['deep work','focus block','writing time'] },
  { id:'str.product_launch',   label:'Product launch / Go-live', bucket:'Deep Work & Strategy', categoryId:'E', group:'F_operational', primaryPillar:4, secondaryPillar:2, demandProfile:D(2,2,2,1,2,3,0,2), timingMatrix:{pre:true,during:true,post:true}, regulationObjective:'PREPARE', interventionType:'Flow', keywords:['launch','go live','release','ship','product launch'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:1440 },

  // ── Category F · Conferences & External Events ──
  { id:'conf.keynote',         label:'Keynote',               bucket:'Conferences & External Events', categoryId:'F', group:'D_visibility', primaryPillar:2, demandProfile:D(1,1,3,1,0,3,0,3), timingMatrix:{pre:true,during:false,post:true,postMandatory:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['keynote'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:720 },
  { id:'conf.speaking',        label:'Conference speaking / Panel', bucket:'Conferences & External Events', categoryId:'F', group:'D_visibility', primaryPillar:2, demandProfile:D(1,1,3,1,0,2,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['conference','summit','panel discussion','panel','roundtable','fireside','speaking','webinar'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:720 },
  { id:'conf.offsite',         label:'Off-site / Retreat',    bucket:'Conferences & External Events', categoryId:'F', group:'D_visibility', primaryPillar:2, secondaryPillar:3, demandProfile:D(2,2,2,1,3,3,0,1), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['offsite','off-site','retreat'], masteryModules:['regulate','align'], jitLeadTimeMinutes:720 },
  { id:'conf.award',           label:'Award / Recognition event', bucket:'Conferences & External Events', categoryId:'F', group:'D_visibility', primaryPillar:2, demandProfile:D(1,1,3,0,1,2,0,2), timingMatrix:{pre:true,during:false,post:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['award','recognition event','awards ceremony','gala'] },
  { id:'conf.customer_summit', label:'Customer / partner summit', bucket:'Conferences & External Events', categoryId:'F', group:'D_visibility', primaryPillar:2, secondaryPillar:3, demandProfile:D(2,1,2,1,3,3,0,2), timingMatrix:{pre:true,during:false,post:true,postMandatory:true}, regulationObjective:'PREPARE', interventionType:'Pause', keywords:['customer summit','partner summit','user conference'], masteryModules:['regulate','align','prepare'], jitLeadTimeMinutes:720 },
  { id:'conf.networking',      label:'Networking event',      bucket:'Conferences & External Events', categoryId:'F', group:'D_visibility', primaryPillar:2, demandProfile:D(0,1,1,0,2,1,0,0), timingMatrix:{pre:false,during:false,post:false}, regulationObjective:'PROTECT', interventionType:'Pause', keywords:['networking event','networking dinner','networking drinks','meetup','mixer'], classificationOnly:true },

  // ── Category G · Travel ──
  { id:'trv.long_haul',        label:'Long-haul flight',      bucket:'Travel', categoryId:'G', group:'G_travel', primaryPillar:4, secondaryPillar:5, demandProfile:D(1,1,0,0,0,3,3,0), timingMatrix:{pre:true,during:true,post:true,postMandatory:true}, regulationObjective:'PROTECT', interventionType:'Pause', keywords:['long-haul','long haul','red-eye','redeye','overnight flight'] },
  { id:'trv.flight',           label:'Flight / Travel',       bucket:'Travel', categoryId:'G', group:'G_travel', primaryPillar:4, secondaryPillar:5, demandProfile:D(1,1,0,0,0,2,2,0), timingMatrix:{pre:true,during:true,post:true}, regulationObjective:'PROTECT', interventionType:'Pause', keywords:['flight','airport','boarding','departure','arrival','layover','transit'], excludeKeywords:['onboarding','off-boarding','offboarding','flight showcase','flight deck review','flight risk','test flight'] },

  // ── Category H · Daily Rhythm & Baseline ──
  { id:'rhy.catchup',          label:'Catch-up / Sync',       bucket:'Daily Rhythm & Baseline', categoryId:'H', group:'F_operational', primaryPillar:4, demandProfile:D(1,1,0,0,2,1,0,0), timingMatrix:{pre:false,during:false,post:false}, regulationObjective:'PROTECT', interventionType:'Pause', keywords:['catchup','catch-up','catch up','sync','check-in','check in','weekly','standup','stand-up'] },
  { id:'rhy.pto',              label:'PTO / Time off',        bucket:'Daily Rhythm & Baseline', categoryId:'H', group:'H_recovery', primaryPillar:5, demandProfile:D(0,0,0,0,0,0,0,1), timingMatrix:{pre:false,during:false,post:false}, regulationObjective:'RECOVER', interventionType:'Pause', keywords:['out of office','ooo','annual leave','holiday','vacation','pto','day off','away'] },
];

export const EVENT_TYPES: EventType[] = ROWS.map((r) => ({ ...r, frameworkPillar: r.categoryId }));

// ── EVENT_TYPE → mastery scenarioId ──────────────────────────────────
export const EVENT_TYPE_TO_SCENARIO_ID: Record<string, string | null> = {
  'gov.board_meeting':           'pre-board-meeting',
  'gov.board_committee':         'pre-board-meeting',
  'gov.board_prep':              'pre-board-meeting',
  'gov.investor_meeting':        'pre-investor-meeting',
  'gov.earnings_call':           'pre-budget-review',
  'gov.qbr':                     'pre-quarterly-review',
  'gov.budget_review':           'pre-budget-review',
  'gov.ma_discussion':           'pre-negotiations',
  'gov.crisis':                  'pre-crisis-response',
  'inf.fundraising':             'pre-investor-meeting',
  'inf.negotiation':             'pre-negotiations',
  'inf.client_presentation':     'pre-client-presentation',
  'vis.media':                   'pre-media',
  'vis.all_hands':               'pre-all-hands',
  'lead.executive_1on1':         null,
  'lead.leadership_sync':        'pre-all-hands',
  'lead.performance_review':     'pre-performance-review',
  'lead.difficult_conversation': 'pre-difficult-conversation',
  'lead.layoff':                 'pre-difficult-conversation',
  'lead.hiring_committee':       'pre-hiring-decision',
  'str.strategy_planning':       'pre-strategic-planning',
  'str.deep_work':               null,
  'str.product_launch':          'pre-strategic-planning',
  'conf.keynote':                'pre-speaking-engagement',
  'conf.speaking':               'pre-speaking-engagement',
  'conf.offsite':                'pre-strategic-planning',
  'conf.award':                  'pre-speaking-engagement',
  'conf.customer_summit':        'pre-speaking-engagement',
  'conf.networking':             null,
  'trv.long_haul':               null,
  'trv.flight':                  null,
  'rhy.catchup':                 null,
  'rhy.pto':                     null,
};
