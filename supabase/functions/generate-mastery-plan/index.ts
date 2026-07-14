import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest } from '../_shared/auth.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import {
  isNoiseTitle,
  scenarioIdFor,
  isEducationalTitle,
  coarseEventType,
  canonicalEventTag,
  canonicalTagForCoarse,
  eventClusterSignal,
  eventPressureFlag,
} from '../_shared/executive-state-taxonomy.ts';
import { isHighStakesTitle } from '../_shared/events/event-classifier.ts';
import { detectClientPlatform, wrapDbWithCalendarPrimacy } from '../_shared/calendar-provider.ts';
import { applySlotBoostsToMapping } from '../_shared/behaviour-wiring.ts';
// Canonical reader of the Brief's behaviour snapshot. Plan MUST consume the
// same `flagsPlan` + `slotBoosts` + `taxonomyBlock` the Brief reasoned over
// rather than rebuilding its own — otherwise Brief↔Plan drift is structural.
// See _shared/load-brief-behaviour-snapshot.ts for the contract.
import {
  loadBriefBehaviourSnapshot,
  snapshotToWiring,
  briefAnchorEventTitles,
  type LoadedBriefBehaviourSnapshot,
  type PersistedBriefBehaviourSnapshot,
} from '../_shared/load-brief-behaviour-snapshot.ts';
// Fallback builder for the rare case where the Brief hasn't been written
// yet for the current (user, local_date, time_window). Pure, no DB.
import { buildBehaviourSnapshot } from '../_shared/behaviour-snapshot.ts';
import { BRIEF_PROMPT_VERSION } from '../_shared/brief-prompt-version.ts';
import { buildReadinessAwaitingMessage } from '../_shared/copy/awaiting.ts';
// §3/§4 CEO Self-Regulation Framework — shared event taxonomy + per-phase
// (Pre / During / Post) contract. Slot labelling and JIT framing now consult
// these modules instead of redefining the taxonomy locally.
import {
  EVENT_CATEGORIES,
  FRAMEWORK_PILLARS,
  type EventCategoryId,
} from '../_shared/events/event-categories.ts';
import { classifyEvent } from '../_shared/events/event-classifier.ts';
import { shadowClassifyAndLog } from '../_shared/events/shadow-classify.ts';
import {
  EVENT_PHASE_MAP,
  phaseForEvent,
  protocolsForEvent,
  CATEGORY_MAX_SLOTS,
  type Phase,
} from '../_shared/events/event-phase-map.ts';
import {
  EVENT_TYPES,
  EVENT_TYPE_TO_SCENARIO_ID,
} from '../_shared/events/event-subtypes.ts';
import {
  PROTOCOL_COMBOS,
  PRACTICE_TYPE_TO_COMBO,
  COMBO_TO_PRACTICE_TYPE,
  type ComboKey,
} from '../_shared/protocols/protocol-combos.ts';
import { type RelationshipRole } from '../_shared/jit/relationship-taxonomy.ts';
import { isTravelTitle as isTravelTitleCanonical } from '../_shared/ceo-behaviour/travel.ts';
import { decideTravelFreshness } from '../_shared/travel/freshness.ts';
import { isPtoOrHolidayTitle, isPersonalHolidayTitle } from '../_shared/ceo-behaviour/pto-holiday.ts';
import { classifyAvailability } from '../_shared/availability/availability-classifier.ts';
import { enrichEvent } from '../_shared/events/enrich-event.ts';
import { rankJitCandidates, type RankedJitCandidate } from '../_shared/events/jit-candidates.ts';
import { allocatePlanSlots } from '../_shared/jit/slot-allocator.ts';
import {
  deriveSlotIntent,
  findAlternate,
  selectPracticeForSlot,
  type SelectionSlotContract,
} from '../_shared/plan/practice-selector.ts';
import {
  applyEventPriorityMemory,
  loadPriorityMemoryForUser,
  type PriorityMemoryIndex,
} from '../_shared/plan/event-priority-memory.ts';
import { mergeCalendarEvents } from '../_shared/rules/calendarEvents.ts';
import { logMergeStats } from '../_shared/rules/calendar-merge.ts';
import {
  normalizeEventTypeKey,
  evaluateWeekAheadMode,
} from '../_shared/plan/week-ahead-mode.ts';
import {
  DAY_OF_HORIZON_MS,
  isWithinDayOfHorizon,
  gateDayOfAnchor,
} from '../_shared/plan/day-of-horizon.ts';
// Today's-3 Priorities title + sub-line + Why generators (deterministic title/frame, LLM why).
import { buildPlanTitle, buildPriorityTitle, verbForCategoryPhase, type SlotAnchor } from '../_shared/plan/title-prefixes.ts';
import { stripBriefMarkdown } from '../_shared/text/sanitise.ts';
import { buildActionFrame, buildRecommendedActionCopy } from '../_shared/plan/action-frame.ts';
import {
  scoreContentAgainstIntent,
  type SlotIntent,
} from '../_shared/plan/practice-selector.ts';
import {
  arcPositionFromPhase,
  generateWhyStatement,
  jaccard,
  tierToStateBand,
  validateWhyLine,
  type ArcPosition,
  type StateBand,
  type WhyLLMInput,
} from '../_shared/plan/why-llm.ts';
// JIT v2 shadow-mode selector (PR 1). Runs in parallel with the legacy
// scorer when JIT_V2 env is "shadow"; writes shadow columns to
// jit_event_context for week-1 parity testing. Does not affect what the
// user sees until PR 2.
import { selectJitCandidates, type SelectInputEvent } from '../_shared/jit/select-jit.ts';
import { redactUserId } from "../_shared/identity/redact-user-id.ts";
// Phase 3 — Unified CoS Leader Profile reader. Single source of truth for
// leader goals, voice rules, high-stakes priors and preferences. Missing
// or in-progress profiles resolve to a null-safe shell so the Plan
// continues to work exactly as before when the profile is unavailable.
import { loadLeaderProfile, type LeaderProfileContext } from '../_shared/leader-profile-loader.ts';
import {
  isGenericDomain,
  inferRoleFromDomain,
  type AttendeeRoleSignal,
  type ResolvedRole,
  type RoleSource,
} from '../_shared/jit/relationship-weights.ts';

/**
 * JIT v2 shadow runner (PR 1). Pure side-effect; safe to fire-and-forget.
 * Loads account age + canonical pattern summary + resolved attendee roles,
 * runs the new selector, and stamps shadow_v2_* columns on the matching
 * jit_event_context rows the legacy bridge already wrote this run.
 */
async function runJitV2Shadow(
  supabase: any,
  userId: string,
  scoredEvents: any[],
  filteredEvents: any[],
  req: any,
): Promise<void> {
  // Run on the broader scored set so v2 has visibility even when the legacy
  // suppression filter drops everything; fall back to filteredEvents.
  const sourceEvents = Array.isArray(scoredEvents) && scoredEvents.length > 0
    ? scoredEvents
    : (Array.isArray(filteredEvents) ? filteredEvents : []);
  if (sourceEvents.length === 0) return;

  // Account age in days (floor by profiles.created_at).
  let accountAgeDays = 0;
  try {
    const { data: prof } = await supabase
      .from('profiles').select('created_at').eq('id', userId).maybeSingle();
    if (prof?.created_at) {
      accountAgeDays = Math.floor((Date.now() - new Date(prof.created_at).getTime()) / 86_400_000);
    }
  } catch (_e) { /* default 0 → T0 */ }

  // Canonical pattern summary (never recomputed here).
  let signalSummary: any = null;
  try {
    const { data } = await supabase
      .from('causality_findings')
      .select('signal_summary')
      .eq('user_id', userId)
      .eq('pattern_kind', 'cause_effect_v2')
      .order('computed_for_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    signalSummary = (data as any)?.signal_summary ?? null;
  } catch (_e) { /* null → tier T0 */ }

  // MRS v2 Phase D — snapshot-first visibility of patternSignals (hrv_3day_trend,
  // consecutive_high_load_days, sustained_deficit_flag). Tier weights still
  // resolve from causality_findings.signal_summary (canonical proactive-pattern
  // store per mem://architecture/unified-pattern-store); this snapshot read
  // is observability + cold-start visibility for the shadow run. Never throws.
  try {
    const todayLocal = new Date().toISOString().split('T')[0];
    // Phase 2 — daily_context_snapshot is window-scoped. For this
    // observability log we just want the latest row for today regardless
    // of window.
    const { data: snapRow } = await supabase
      .from('daily_context_snapshot')
      .select('pattern_signals, supply_demand_gap_flag, calendar_demand_score, mrs_window')
      .eq('user_id', userId)
      .eq('local_date', todayLocal)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const ps = (snapRow as any)?.pattern_signals ?? null;
    if (ps) {
      console.log(`[generate-mastery-plan][mrs-v2] snapshot patternSignals: hrv_3day_trend=${ps.hrv_3day_trend ?? 'unknown'} consecutive_high_load_days=${ps.consecutive_high_load_days ?? 0} sustained_deficit=${ps.sustained_deficit_flag ? 'yes' : 'no'} gap=${(snapRow as any)?.supply_demand_gap_flag ?? 'none'} demandScore=${(snapRow as any)?.calendar_demand_score ?? 'null'}`);
    } else {
      console.log(`[generate-mastery-plan][mrs-v2] snapshot patternSignals: <missing for ${todayLocal}>`);
    }
  } catch (_e) { /* observability only — never block plan */ }

  // ───────────────────────────────────────────────────────────────────
  // Relationship resolution chain (§C of the SSOT):
  //   1. user_tag       — sovereign, full weight, no decay
  //   2. memory_user_tag — replayed from prior tag_relationship
  //   3. llm            — cached attendee_relationships (Gemini-only resolver)
  //   4. domain_heuristic — same-domain → peer; external → external_partner
  //   5. unknown        — zero contribution, never demote
  // Confidence gating happens inside relationshipWeight.
  // ───────────────────────────────────────────────────────────────────

  // Collect attendee emails per event for memory replay + signal building.
  const emails = new Set<string>();
  const attendeesByEventId = new Map<string, string[]>();
  for (const fe of sourceEvents) {
    const ev = fe?.event ?? fe;
    const att = ev?.attendees;
    const evId = ev?.id;
    const list: string[] = [];
    if (Array.isArray(att)) for (const a of att) {
      const em = typeof a === 'string' ? a : a?.email;
      if (typeof em === 'string' && em.includes('@')) {
        const norm = em.toLowerCase().trim();
        emails.add(norm);
        list.push(norm);
      }
    }
    if (typeof evId === 'string' && evId) attendeesByEventId.set(evId, list);
  }

  // User's own email-domain — drives the domain heuristic. Best-effort.
  let userOwnDomain: string | null = null;
  try {
    const { data: profEmail } = await supabase
      .from('profiles').select('email').eq('id', userId).maybeSingle();
    const em = (profEmail as any)?.email;
    if (typeof em === 'string') {
      const at = em.lastIndexOf('@');
      if (at >= 0) userOwnDomain = em.slice(at + 1).toLowerCase().trim();
    }
  } catch (_e) { /* heuristic is optional */ }

  const signalByEmail = new Map<string, AttendeeRoleSignal>();
  const legacyMemoryKeysByEventId = new Map<string, { eventCategory: string; eventTypeKey: string }>();
  for (const fe of sourceEvents) {
    const ev = fe?.event ?? fe;
    const id = ev?.id;
    const title = typeof ev?.title === 'string' ? ev.title : '';
    if (typeof id !== 'string' || !id || !title) continue;
    legacyMemoryKeysByEventId.set(id, {
      eventCategory: coarseEventType(title),
      eventTypeKey: normalizeEventTypeKey(title),
    });
  }

  // 3. Cached attendee_relationships (LLM resolver output, or user_tag rows
  //    upserted by record-event-priority-signal). Pull source + confidence.
  if (emails.size > 0) {
    try {
      const { data } = await supabase
        .from('attendee_relationships')
        .select('attendee_email, role, source, confidence, expires_at')
        .eq('user_id', userId)
        .in('attendee_email', Array.from(emails));
      for (const r of (data ?? [])) {
        if (r?.expires_at && new Date(r.expires_at).getTime() < Date.now()) continue;
        const src = (r as any).source as string | null;
        const source: RoleSource = src === 'user_tag' ? 'user_tag' : 'llm';
        signalByEmail.set(r.attendee_email, {
          role: ((r as any).role as ResolvedRole) || 'unknown',
          source,
          confidence: source === 'user_tag' ? 1 : (typeof (r as any).confidence === 'number' ? (r as any).confidence : null),
        });
      }
    } catch (_e) { /* fall through to heuristic */ }
  }

  // Backstop late-resolve. The proactive post-sync hook in `sync-calendar`
  // / `sync-apple-calendar` queues `resolve-attendee-relationship` for new
  // attendees, so most rows are already cached here. This lazy fire stays
  // in place to catch (a) race between sync and plan, (b) attendees added
  // to events between syncs, (c) users who tag relationships out-of-band.
  // Bounded by 1500 ms total; resolver self-caps at 50 lookups/user/day.
  const unresolvedEmails: string[] = [];
  for (const em of emails) {
    if (!signalByEmail.has(em) && !isGenericDomain(em)) unresolvedEmails.push(em);
  }
  if (unresolvedEmails.length > 0 && unresolvedEmails.length <= 10) {
    try {
      const resolverBase = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
      const resolverKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      const fireOne = (attendee_email: string) => fetch(`${resolverBase}/functions/v1/resolve-attendee-relationship`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resolverKey}` },
        body: JSON.stringify({ user_id: userId, attendee_email }),
      }).catch(() => null);
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500));
      await Promise.race([
        Promise.all(unresolvedEmails.slice(0, 10).map(fireOne)).then(() => undefined),
        timeout,
      ]);
      const { data: data2 } = await supabase
        .from('attendee_relationships')
        .select('attendee_email, role, source, confidence, expires_at')
        .eq('user_id', userId)
        .in('attendee_email', unresolvedEmails);
      for (const r of (data2 ?? [])) {
        if (r?.expires_at && new Date(r.expires_at).getTime() < Date.now()) continue;
        if (signalByEmail.has(r.attendee_email)) continue;
        const src = (r as any).source as string | null;
        const source: RoleSource = src === 'user_tag' ? 'user_tag' : 'llm';
        signalByEmail.set(r.attendee_email, {
          role: ((r as any).role as ResolvedRole) || 'unknown',
          source,
          confidence: source === 'user_tag' ? 1 : (typeof (r as any).confidence === 'number' ? (r as any).confidence : null),
        });
      }
      console.log(`[generate-mastery-plan][jit-v2] late-resolve fired=${unresolvedEmails.length} resolved=${(data2 ?? []).length}`);
    } catch (e) {
      console.warn('[generate-mastery-plan][jit-v2] late-resolve failed', (e as Error)?.message);
    }
  }

  // 2. Memory replay — prior `tag_relationship` rows for any event in scope
  //    map their relationshipTag to a ResolvedRole and stamp every attendee
  //    on the same event as `memory_user_tag` (full weight, no decay), but
  //    only when no cached row already covers that email. This means a
  //    recurring 1:1 tagged "Boss" once keeps its role indefinitely
  //    without re-hitting the resolver (Gemini + optional Firecrawl
  //    enrichment). User tags are sovereign and never overwritten.
  try {
    const RELATIONSHIP_TAG_TO_ROLE: Record<string, RelationshipRole> = {
      boss: 'direct_boss',
      board: 'board_member',
      client: 'client',
      customer: 'customer',
      vendor: 'vendor',
      team: 'report_direct',
      junior: 'report_junior',
      colleague: 'peer',
      investor: 'investor',
      leadership: 'skip_level',
    };
    const eventIds: string[] = [];
    for (const fe of sourceEvents) {
      const id = (fe?.event ?? fe)?.id;
      if (typeof id === 'string' && id) eventIds.push(id);
    }
    if (eventIds.length > 0) {
      const { data: memRows } = await supabase
        .from('event_priority_memory')
        .select('event_id, signal, meta, occurred_at')
        .eq('user_id', userId)
        .in('event_id', eventIds)
        .eq('signal', 'tag_relationship')
        .order('occurred_at', { ascending: false });
      const legacyPairs = Array.from(new Set(Array.from(legacyMemoryKeysByEventId.values()).map((v) => `${v.eventCategory}::${v.eventTypeKey}`)));
      const legacyRows = legacyPairs.length > 0
        ? await (async () => {
            const categories = Array.from(new Set(Array.from(legacyMemoryKeysByEventId.values()).map((v) => v.eventCategory)));
            const typeKeys = Array.from(new Set(Array.from(legacyMemoryKeysByEventId.values()).map((v) => v.eventTypeKey)));
            const { data } = await supabase
              .from('event_priority_memory')
              .select('event_category, event_type_key, signal, meta, occurred_at')
              .eq('user_id', userId)
              .in('event_category', categories)
              .in('event_type_key', typeKeys)
              .eq('signal', 'tag_relationship')
              .order('occurred_at', { ascending: false });
            return (data ?? []).filter((r: any) => legacyPairs.includes(`${r?.event_category}::${r?.event_type_key}`));
          })()
        : [];
      const stampedFor = new Set<string>(); // event_id or legacy key → latest tag wins
      for (const r of [...(memRows ?? []), ...legacyRows] as any[]) {
        const tag = String(r?.meta?.relationshipTag || '').toLowerCase().trim();
        const role = RELATIONSHIP_TAG_TO_ROLE[tag];
        if (!role) continue;
        const legacyKey = r?.event_category && r?.event_type_key ? `${r.event_category}::${r.event_type_key}` : null;
        const lookupId = r?.event_id || (legacyKey ? Array.from(legacyMemoryKeysByEventId.entries()).find(([, v]) => `${v.eventCategory}::${v.eventTypeKey}` === legacyKey)?.[0] : null);
        if (!lookupId || stampedFor.has(lookupId)) continue;
        stampedFor.add(lookupId);
        const ems = lookupId ? (attendeesByEventId.get(lookupId) ?? []) : [];
        for (const em of ems) {
          const existing = signalByEmail.get(em);
          // memory_user_tag fills unresolved or upgrades llm/heuristic;
          // never overrides a fresh user_tag row.
          if (existing && existing.source === 'user_tag') continue;
          signalByEmail.set(em, { role, source: 'memory_user_tag', confidence: 1 });
        }
      }
    }
  } catch (e) {
    console.warn('[generate-mastery-plan][jit-v2] memory-replay failed', (e as Error)?.message);
  }

  // 4. Domain-based heuristic — fills anything still unresolved with a
  //    low-confidence directional signal so important external meetings
  //    don't score flat-zero while the async resolver catches up.
  for (const em of emails) {
    if (signalByEmail.has(em)) continue;
    const sig = inferRoleFromDomain(em, userOwnDomain);
    if (sig.role !== 'unknown') signalByEmail.set(em, sig);
  }

  // Sovereign user-tag layer — fetch latest tag_importance_* / tag_custom
  // / tag_cleared rows from event_priority_memory for every event in
  // scope. Most-recent-per-(event_id, kind) wins; `tag_cleared` wipes
  // any earlier importance for the same event.
  const sovereignTagsByEventId = new Map<string, string[]>();
  try {
    const ids: string[] = [];
    for (const fe of sourceEvents) {
      const id = (fe?.event ?? fe)?.id;
      if (typeof id === 'string' && id) ids.push(id);
    }
    if (ids.length > 0) {
      const { data: tagRows } = await supabase
        .from('event_priority_memory')
        .select('event_id, signal, meta, occurred_at')
        .eq('user_id', userId)
        .in('event_id', ids)
        .in('signal', ['tag_importance_high', 'tag_importance_medium', 'tag_importance_low', 'tag_custom', 'tag_cleared'])
        .order('occurred_at', { ascending: false });
      const legacyPairs = Array.from(new Set(Array.from(legacyMemoryKeysByEventId.values()).map((v) => `${v.eventCategory}::${v.eventTypeKey}`)));
      const legacyTagRows = legacyPairs.length > 0
        ? await (async () => {
            const categories = Array.from(new Set(Array.from(legacyMemoryKeysByEventId.values()).map((v) => v.eventCategory)));
            const typeKeys = Array.from(new Set(Array.from(legacyMemoryKeysByEventId.values()).map((v) => v.eventTypeKey)));
            const { data } = await supabase
              .from('event_priority_memory')
              .select('event_category, event_type_key, signal, meta, occurred_at')
              .eq('user_id', userId)
              .in('event_category', categories)
              .in('event_type_key', typeKeys)
              .in('signal', ['tag_importance_high', 'tag_importance_medium', 'tag_importance_low', 'tag_custom', 'tag_cleared'])
              .order('occurred_at', { ascending: false });
            return (data ?? []).filter((r: any) => legacyPairs.includes(`${r?.event_category}::${r?.event_type_key}`));
          })()
        : [];
      const seenImportance = new Set<string>();   // event_id where importance already set (latest wins)
      const clearedFor = new Set<string>();
      const customByEvent = new Map<string, Set<string>>();
      for (const r of [...(tagRows ?? []), ...legacyTagRows] as any[]) {
        const eid = r?.event_id || (r?.event_category && r?.event_type_key
          ? Array.from(legacyMemoryKeysByEventId.entries()).find(([, v]) => `${v.eventCategory}::${v.eventTypeKey}` === `${r.event_category}::${r.event_type_key}`)?.[0]
          : null);
        if (!eid) continue;
        if (r.signal === 'tag_cleared') { clearedFor.add(eid); continue; }
        if (r.signal === 'tag_custom') {
          const arr = Array.isArray(r?.meta?.customTags) ? r.meta.customTags : [];
          if (!customByEvent.has(eid)) customByEvent.set(eid, new Set<string>());
          for (const t of arr) if (t) customByEvent.get(eid)!.add(String(t));
          continue;
        }
        if (r.signal.startsWith('tag_importance_')) {
          if (seenImportance.has(eid)) continue;            // older
          if (clearedFor.has(eid)) { seenImportance.add(eid); continue; } // wiped
          const level = r.signal.slice('tag_importance_'.length); // high|medium|low
          const list = sovereignTagsByEventId.get(eid) ?? [];
          list.push(level);
          sovereignTagsByEventId.set(eid, list);
          seenImportance.add(eid);
        }
      }
      for (const [eid, tags] of customByEvent.entries()) {
        const list = sovereignTagsByEventId.get(eid) ?? [];
        for (const t of tags) list.push(t);
        sovereignTagsByEventId.set(eid, list);
      }
    }
  } catch (e) {
    console.warn('[generate-mastery-plan][jit-v2] sovereign-tag fetch failed', (e as Error)?.message);
  }

  const input: SelectInputEvent[] = sourceEvents.map((fe: any) => {
    const ev = fe?.event ?? fe;
    const roles: AttendeeRoleSignal[] = [];
    const att = ev?.attendees;
    const attendeeDomains: string[] = [];
    if (Array.isArray(att)) for (const a of att) {
      const em = typeof a === 'string' ? a : a?.email;
      if (typeof em === 'string') {
        const norm = em.toLowerCase().trim();
        const s = signalByEmail.get(norm);
        if (s) roles.push(s);
        const at = norm.lastIndexOf('@');
        if (at >= 0) attendeeDomains.push(norm.slice(at + 1));
      }
    }
    const rawStart = ev?.start_time ?? ev?.startTime ?? ev?.start ?? null;
    const rawEnd = ev?.end_time ?? ev?.endTime ?? ev?.end ?? null;
    const startIso = rawStart instanceof Date ? rawStart.toISOString() : (rawStart ?? '');
    const endIso = rawEnd instanceof Date ? rawEnd.toISOString() : (rawEnd ?? '');
    const baseTags = Array.isArray(ev?.tags) ? ev.tags.map((t: any) => String(t)) : [];
    const sovTags = (ev?.id && sovereignTagsByEventId.get(ev.id)) || [];
    const mergedTags = [...sovTags, ...baseTags];
    const rawCreated = ev?.created_at ?? ev?.createdAt ?? null;
    const createdIso = rawCreated instanceof Date ? rawCreated.toISOString() : (rawCreated ?? null);
    const organizerEmail = (typeof ev?.organizer === 'string'
      ? ev.organizer
      : (ev?.organizer?.email ?? ev?.organizer_email ?? null)) || null;
    return {
      id: ev?.id,
      title: ev?.title || '',
      start_time: startIso,
      end_time: endIso,
      createdAt: createdIso,
      organizerEmail,
      attendeeDomains,
      userDomain: userOwnDomain ?? null,
      attendeesCount: typeof ev?.attendees_count === 'number'
        ? ev.attendees_count
        : (typeof ev?.attendeesCount === 'number' ? ev.attendeesCount : 0),
      attendeeRoles: roles,
      tags: mergedTags,
    };
  });

  // Phase 3 — leader profile goals take priority as the declared growth
  // lane. Existing sources (request-level growthIntention, practice tag,
  // coach growth_area) remain as fallback so plans still work when the
  // CoS profile is missing/in_progress.
  const leaderDeclaredGoals: string[] = Array.isArray(req?.leaderProfile?.goals?.declared)
    ? (req.leaderProfile!.goals!.declared as string[]).filter(Boolean)
    : [];
  const fallbackGrowthIntentions = typeof req?.growthIntention === 'string' ? [req.growthIntention] : [];
  const goals = {
    growthIntentions: leaderDeclaredGoals.length > 0 ? leaderDeclaredGoals : fallbackGrowthIntentions,
    practicePriorityTags: req?.practicePriorityTag ? [String(req.practicePriorityTag)] : [],
    coachGrowthAreas: (req?.coachInsights || [])
      .filter((i: any) => i?.type === 'growth_area')
      .map((i: any) => String(i.content || ''))
      .filter(Boolean),
    protectGoals: Array.isArray(req?.protectGoals) ? req.protectGoals.map((g: any) => String(g))
      : Array.isArray(req?.onboarding?.protectGoals) ? req.onboarding.protectGoals.map((g: any) => String(g))
      : [],
  };

  const result = selectJitCandidates(input, {
    accountAgeDays,
    signalSummary,
    skipCountsByBucket: {},        // PR 1: empty; PR 2 wires jit_preferences
    followThroughByBucket: {},
    goals,
    nowMs: Date.now(),
  });

  console.log(`[generate-mastery-plan][jit-v2-shadow] tier=${result.tier.tier} ageDays=${accountAgeDays} patternCount=${result.tier.patternCount} ranked=${result.ranked.length} excluded=${result.excluded.length} top=${result.ranked[0]?.title ?? 'none'}@${result.ranked[0]?.importance ?? 0}`);

  // Phase 3 — one-shot goal-alignment summary. Diagnostic only.
  try {
    console.info('[plan][goal-alignment][summary]', {
      userId,
      source: leaderDeclaredGoals.length > 0 ? 'leader_profile' : 'fallback',
      goals: goals.growthIntentions,
      practicePriorityTags: goals.practicePriorityTags,
      coachGrowthAreas: goals.coachGrowthAreas,
      chosenModuleIds: result.ranked.slice(0, 5).map((c: any) => c.eventId ?? c.id ?? null),
      chosenTitles: result.ranked.slice(0, 5).map((c: any) => c.title ?? null),
    });
  } catch { /* logging must never break plan generation */ }

  // Capture legacy top for parity (filteredEvents[0] is the legacy winner).
  const legacyTop = (filteredEvents && filteredEvents[0]) || null;
  const legacyTopId = legacyTop?.event?.id ?? null;
  const v2Top = result.ranked[0] ?? null;
  const parityMatch = legacyTopId && v2Top ? legacyTopId === v2Top.eventId : null;

  // Stamp shadow columns onto any matching legacy bridge rows (best effort).
  for (const c of result.ranked.slice(0, 5)) {
    try {
      await supabase
        .from('jit_event_context')
        .update({
          shadow_v2_score: c.importance,
          shadow_v2_components: c.components,
          shadow_v2_tier: result.tier.tier,
          shadow_v2_role: c.role,
          shadow_v2_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('calendar_event_id', c.eventId);
    } catch (_e) { /* best effort */ }
  }

  // Always log a standalone shadow run row for week-1 parity analysis.
  try {
    await supabase.from('jit_shadow_v2_runs').insert({
      user_id: userId,
      tier: result.tier.tier,
      account_age_days: accountAgeDays,
      pattern_count: result.tier.patternCount,
      ranked_count: result.ranked.length,
      excluded_count: result.excluded.length,
      top_event_id: v2Top?.eventId ?? null,
      top_event_title: v2Top?.title ?? null,
      top_event_role: v2Top?.role ?? null,
      top_importance: v2Top?.importance ?? null,
      top_components: v2Top?.components ?? null,
      legacy_top_event_id: legacyTopId,
      legacy_top_event_title: legacyTop?.event?.title ?? null,
      legacy_top_score: legacyTop?.score ?? null,
      parity_match: parityMatch,
      ranked: result.ranked.slice(0, 10),
      excluded: result.excluded.slice(0, 10),
    });
  } catch (e: any) {
    console.warn('[generate-mastery-plan][jit-v2-shadow] insert_run_failed:', e?.message);
  }
}

// FRAMEWORK_PILLARS, EVENT_TYPES, protocolsForEvent are re-exported via the
// import surface so future passes (Phase B/C) can read them without a new
// import touch. Silence unused-import noise in tools that check.
void FRAMEWORK_PILLARS; void EVENT_TYPES; void EVENT_TYPE_TO_SCENARIO_ID; void protocolsForEvent;

// CORS headers are now per-request via getCorsHeaders(req). See _shared/cors.ts.

// ==================== RATE LIMITING ====================
const rateLimitMap = new Map<string, { lastCall: number; cachedResponse: any }>();
const RATE_LIMIT_COOLDOWN_MS = 30_000; // 30s per user

// ==================== TYPES ====================

interface ModuleSpec {
  type: 'regulate' | 'align' | 'prepare' | 'integrate';
  required: boolean;
  priority: number;
  intensity: 'gentle' | 'moderate' | 'activating';
  duration: 'micro' | 'short' | 'standard';
  focus: string;
}

interface ThemeModuleMapping {
  regulate?: ModuleSpec;
  align?: ModuleSpec;
  prepare?: ModuleSpec;
  integrate?: ModuleSpec;
}

interface ExecutiveScenario {
  id: string;
  name: string;
  contextLabel: string;
  triggers: {
    /**
     * @deprecated Do not use for runtime scenario detection.
     * Scenario classification MUST go through `scenarioIdFor()` / the canonical
     * event classifier in `_shared/events/event-classifier.ts`.
     * These arrays are retained only as human-readable documentation of which
     * calendar phrasings the canonical classifier is expected to cover for each
     * scenario id, and must not be read at runtime.
     */
    calendarKeywords?: string[];
    hoursAhead?: number;
    wearableCondition?: string;
    checkInPattern?: string;
    timeOfDay?: string;
  };
  modules: ModuleSpec[];
  rolePlayEligible?: boolean;
  mentalModelTag?: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  isOrganizer?: boolean;
  attendeesCount?: number;
  isRecurring?: boolean;
  eventMetadata?: Record<string, unknown> | null;
}

interface WearableContext {
  sleepScore: number | null;
  hrvMs: number | null;
  restingHR: number | null;
  hrvDeviation: number | null;
  sleepQuality: string | null;
  hasData: boolean;
}

interface PlanRequest {
  // Verified server-side – NOT from client
  userId: string;
  // Only client-supplied field
  timezoneOffset: number;
  localDate?: string;
  todayCheckinId?: string | null;
  mrsReadinessState?: 'baseline' | 'refined' | 'awaiting' | null;
  mrsReadinessScore?: number | null;
  /**
   * Explicit target window for persistence + gating. Set by the Executive
   * Home orchestrator (`build-executive-home-cards`) so a manual refresh
   * or backfill for `afternoon` always writes into the `afternoon` row,
   * regardless of the wall-clock at execution time. When omitted (legacy
   * clients), the handler falls back to `getTimeOfDay(timezoneOffset)`.
   */
  timeWindow?: 'morning' | 'afternoon' | 'evening' | null;
  /**
   * Strict Brief↔Plan handshake. When true, the Plan MUST reason over the
   * same-window persisted Brief behaviour snapshot (or the inline snapshot
   * from the same orchestrator request). A missing/stale snapshot returns
   * an awaiting envelope instead of silently rebuilding behaviour flags
   * locally. Set by `build-executive-home-cards`; unset by legacy callers
   * that still want the local fallback.
   */
  strictBriefHandshake?: boolean;
  selectedCalendarEventIds?: string[];
  /**
   * Per-slot replacement map (preferred over `selectedCalendarEventIds`).
   * Anchors a specific calendar event to a specific slot index.
   * Other slots are never re-ranked or touched.
   * Shape: { "0": { eventId }, "1": { eventId }, "2": { eventId } }
   */
  slotReplacements?: Record<string, { eventId: string }>;
  // ALL below are server-fetched – populated inside generateMasteryPlan
  innerReadinessTier: string;
  innerReadinessScore: number | null;
  outerReadinessPhrase: string;
  outerReadinessDriver: string;
  outerReadinessContext: string;
  outerReadinessLeanOn: string;
  outerReadinessWatchFor: string;
  calendarLoad: string;
  calendarPressure: string;
  hasCalendarConnection?: boolean;
  favorites: string[];
  completedToday: string[];
  clarityLevel: number;
  confidenceLevel: number;
  checkInOutcome: string;
  calendarEvents: CalendarEvent[];
  coachInsights?: any[];
  effectiveContent?: string[];
  patternInsight?: { count: number; state: string };
  archetype: string;
  practicePriorityTag?: string;
  pressureContextTag?: string;
  wearableContext: WearableContext;
  latestCheckinTimestamp?: string;
  componentScores?: any;
  /**
   * Phase 3 — CoS Leader Profile loaded once per request via
   * `loadLeaderProfile`. Additive context; treat null fields as
   * "use dynamic behaviour". Never gate on this being non-null.
   */
  leaderProfile?: LeaderProfileContext;
}

// ==================== EXECUTIVE SCENARIOS ====================

const EXECUTIVE_SCENARIOS: ExecutiveScenario[] = [
  {
    id: 'pre-board-meeting', name: 'Pre-Board Meeting', contextLabel: 'Board Meeting Prep',
    triggers: { calendarKeywords: ['board', 'board meeting', 'board of directors'], hoursAhead: 24 },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'composure' },
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'composure' }
    ],
    rolePlayEligible: false, mentalModelTag: 'strategic-framing'
  },
  {
    id: 'pre-investor-meeting', name: 'Pre-Investor Meeting', contextLabel: 'High-Stakes Presentation',
    triggers: { calendarKeywords: ['investor', 'vc', 'funding', 'pitch', 'keynote'], hoursAhead: 24 },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ],
    mentalModelTag: 'trojan-horse-influence'
  },
  {
    id: 'pre-strategic-planning', name: 'Pre-Strategic Planning', contextLabel: 'Strategy Session Prep',
    triggers: { calendarKeywords: ['strategy', 'strategic planning', 'offsite', 'vision', 'roadmap'], hoursAhead: 24 },
    modules: [
      { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ],
    mentalModelTag: 'second-order-thinking'
  },
  {
    id: 'pre-negotiations', name: 'Pre-Negotiations', contextLabel: 'Negotiation Prep',
    triggers: { calendarKeywords: ['negotiation', 'contract', 'deal', 'terms', 'partnership'], hoursAhead: 12 },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'composure' }
    ],
    rolePlayEligible: true
  },
  {
    id: 'pre-all-hands', name: 'Pre-All Hands', contextLabel: 'Company Meeting Prep',
    triggers: { calendarKeywords: ['all hands', 'town hall', 'company meeting', 'team meeting'], hoursAhead: 4 },
    modules: [
      { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' },
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ],
    rolePlayEligible: true
  },
  {
    id: 'pre-media', name: 'Pre-Media/Interview', contextLabel: 'Media Appearance Prep',
    triggers: { calendarKeywords: ['interview', 'podcast', 'media', 'press', 'journalist', 'pr'], hoursAhead: 6 },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' },
      { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ],
    rolePlayEligible: true
  },
  {
    id: 'pre-crisis-response', name: 'Pre-Crisis Response', contextLabel: 'Crisis Preparation',
    triggers: { calendarKeywords: ['crisis', 'urgent', 'emergency', 'incident', 'escalation'], hoursAhead: 2 },
    modules: [
      { type: 'regulate', required: true, priority: 10, intensity: 'gentle', duration: 'micro', focus: 'composure' }
    ]
  },
  {
    id: 'pre-hiring-decision', name: 'Pre-Hiring Decision', contextLabel: 'Hiring Review Prep',
    triggers: { calendarKeywords: ['final round', 'hiring committee', 'offer discussion', 'candidate review', 'executive hire'], hoursAhead: 4 },
    modules: [
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'clarity' }
    ],
    rolePlayEligible: true
  },
  {
    id: 'pre-client-presentation', name: 'Pre-Client Presentation', contextLabel: 'Client Meeting Prep',
    triggers: { calendarKeywords: ['client', 'demo', 'proposal', 'customer', 'account review'], hoursAhead: 8 },
    modules: [
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ]
  },
  {
    id: 'pre-budget-review', name: 'Pre-Budget/Finance Review', contextLabel: 'Finance Review Prep',
    triggers: { calendarKeywords: ['budget', 'finance review', 'forecast', 'financial planning', 'earnings'], hoursAhead: 24 },
    modules: [
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'clarity' }
    ],
    mentalModelTag: 'signal-vs-noise'
  },
  {
    id: 'pre-performance-review', name: 'Pre-Performance Review', contextLabel: 'Review Preparation',
    triggers: { calendarKeywords: ['performance review', 'annual review', 'mid-year review', '360 feedback'], hoursAhead: 8 },
    modules: [
      { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' },
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' }
    ],
    rolePlayEligible: true
  },
  {
    id: 'pre-difficult-conversation', name: 'Pre-Difficult Conversation', contextLabel: 'Conversation Prep',
    triggers: { calendarKeywords: ['feedback', 'pip', 'termination', 'difficult', 'conflict'], hoursAhead: 4 },
    modules: [
      { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'short', focus: 'composure' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' }
    ],
    rolePlayEligible: true
  },
  {
    id: 'pre-quarterly-review', name: 'Pre-Quarterly Review', contextLabel: 'Quarterly Prep',
    triggers: { calendarKeywords: ['quarterly', 'qbr', 'q1', 'q2', 'q3', 'q4'], hoursAhead: 48 },
    modules: [
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ],
    mentalModelTag: 'strategic-framing'
  },
  {
    id: 'pre-speaking-engagement', name: 'Pre-Speaking Engagement', contextLabel: 'Speaking Prep',
    triggers: { calendarKeywords: ['conference', 'summit', 'panel', 'speaking', 'presentation', 'webinar'], hoursAhead: 12 },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' },
      { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ],
    mentalModelTag: 'presence-authority'
  },
  {
    id: 'pre-leadership-meeting', name: 'Pre-Leadership Meeting', contextLabel: 'Leadership Prep',
    triggers: { calendarKeywords: ['leadership team', 'exec team', 'c-suite', 'slt', 'management meeting'], hoursAhead: 4 },
    modules: [
      { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' },
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'clarity' }
    ],
    rolePlayEligible: true
  },
  {
    id: 'pre-ma-discussion', name: 'Pre-M&A Discussion', contextLabel: 'M&A Preparation',
    triggers: { calendarKeywords: ['m&a', 'merger', 'acquisition', 'due diligence', 'acqui-hire'], hoursAhead: 48 },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'composure' },
      { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'composure' }
    ],
    mentalModelTag: 'second-order-thinking'
  },
  {
    id: 'pre-layoff-announcement', name: 'Pre-Layoff Announcement', contextLabel: 'Difficult Announcement Prep',
    triggers: { calendarKeywords: ['layoff', 'restructuring', 'reduction', 'rif', 'downsizing'], hoursAhead: 24 },
    modules: [
      { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'standard', focus: 'composure' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'composure' }
    ],
    rolePlayEligible: true
  },
  {
    id: 'pre-board-presentation', name: 'Pre-Board Presentation Prep', contextLabel: 'Board Deck Prep',
    triggers: { calendarKeywords: ['board deck', 'board presentation', 'board materials'], hoursAhead: 48 },
    modules: [
      { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ],
    mentalModelTag: 'strategic-framing'
  },
  {
    id: 'pre-competitive-intel', name: 'Pre-Competitive Intel', contextLabel: 'Competitive Review Prep',
    triggers: { calendarKeywords: ['competitor', 'competitive analysis', 'competitive intel', 'market analysis'], hoursAhead: 12 },
    modules: [
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'focus' }
    ],
    mentalModelTag: 'art-of-war-positioning'
  },
  {
    id: 'pre-product-launch', name: 'Pre-Product Launch', contextLabel: 'Launch Preparation',
    triggers: { calendarKeywords: ['launch', 'go live', 'release', 'ship', 'product launch'], hoursAhead: 24 },
    modules: [
      { type: 'regulate', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'composure' },
      { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ],
    mentalModelTag: 'strategic-framing'
  },
  // Condition-based scenarios
  {
    id: 'high-cognitive-load', name: 'High Cognitive Load Day', contextLabel: 'Dense Meeting Day',
    triggers: { checkInPattern: 'high-cognitive-day' },
    modules: [
      { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'micro', focus: 'grounding' },
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'focus' }
    ]
  },
  {
    id: 'recovery-day', name: 'Recovery Day', contextLabel: 'Low Energy Recovery',
    triggers: { wearableCondition: 'low_readiness' },
    modules: [
      { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'restore' }
    ]
  },
  {
    id: 'post-tough-day', name: 'Post-Tough Day Recovery', contextLabel: 'Evening Recovery',
    triggers: { timeOfDay: 'evening', checkInPattern: 'consecutive-low' },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'standard', focus: 'release' },
      { type: 'integrate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'release' }
    ]
  }
];

// ==================== THEME TO MODULE MAPPING ====================

const THEME_MODULE_MAP: Record<string, ThemeModuleMapping> = {
  // ==================== DEPLETED TIER (Score 0–39) ====================
  "One thing at a time.": {
    regulate: { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'short', focus: 'composure' },
    align: { type: 'align', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'composure' }
  },
  "Protect what matters.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'restore' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'micro', focus: 'composure' }
  },
  "Reserve for the moment.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'restore' }
  },
  "Navigate, don't absorb.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'micro', focus: 'restore' }
  },
  "Move through gently.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'restore' }
  },
  "Pace and protect.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'standard', focus: 'restore' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Rest is the work.": {
    regulate: { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'standard', focus: 'release' },
    integrate: { type: 'integrate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Begin with intention.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'micro', focus: 'restore' }
  },
  "Close before tomorrow.": {
    regulate: { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'standard', focus: 'release' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'release' },
    integrate: { type: 'integrate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Protect your reserves.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'restore' },
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'micro', focus: 'grounding' }
  },
  // ==================== MANAGING TIER (Score 40–59) ====================
  "Hold your ground.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'composure' },
    align: { type: 'align', required: false, priority: 5, intensity: 'moderate', duration: 'micro', focus: 'focus' }
  },
  "Steady into the stakes.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'composure' },
    align: { type: 'align', required: false, priority: 6, intensity: 'moderate', duration: 'short', focus: 'confidence' }
  },
  "Depth over breadth.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'gentle', duration: 'micro', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Rhythm over intensity.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: false, priority: 5, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Ride the rhythm.": {
    align: { type: 'align', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Steady execution.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'gentle', duration: 'micro', focus: 'composure' },
    align: { type: 'align', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Build your reserves.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'standard', focus: 'restore' },
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Set a sustainable pace.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: false, priority: 5, intensity: 'moderate', duration: 'micro', focus: 'focus' }
  },
  "Close with care.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'release' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Maintain your rhythm.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'gentle', duration: 'micro', focus: 'composure' },
    align: { type: 'align', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  // ==================== STRONG TIER (Score 60–74) ====================
  "Lead from strength.": {
    regulate: { type: 'regulate', required: false, priority: 5, intensity: 'moderate', duration: 'micro', focus: 'composure' },
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Execute with presence.": {
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: false, priority: 6, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Bring your full weight.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'moderate', duration: 'micro', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Sustain the quality.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'composure' },
    align: { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Move with confidence.": {
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Invest the advantage.": {
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'restore' }
  },
  "Protect and build.": {
    regulate: { type: 'regulate', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 7, intensity: 'gentle', duration: 'standard', focus: 'restore' },
    prepare: { type: 'prepare', required: false, priority: 6, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Protect the window.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'moderate', duration: 'micro', focus: 'composure' },
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'focus' }
  },
  "Close strong.": {
    regulate: { type: 'regulate', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'release' },
    align: { type: 'align', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'release' },
    prepare: { type: 'prepare', required: false, priority: 5, intensity: 'moderate', duration: 'short', focus: 'confidence' }
  },
  "Leverage your position.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'moderate', duration: 'micro', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  // ==================== PEAK TIER (Score 75–100) ====================
  "Peak performance day.": {
    regulate: { type: 'regulate', required: false, priority: 5, intensity: 'moderate', duration: 'micro', focus: 'composure' },
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Execute with precision.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'activating', duration: 'micro', focus: 'focus' },
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: false, priority: 6, intensity: 'activating', duration: 'micro', focus: 'confidence' }
  },
  "Seize the high ground.": {
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'focus' }
  },
  "Channel the capacity.": {
    regulate: { type: 'regulate', required: false, priority: 5, intensity: 'moderate', duration: 'micro', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'focus' }
  },
  "Move with full confidence.": {
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Depth and precision.": {
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: false, priority: 6, intensity: 'moderate', duration: 'short', focus: 'confidence' }
  },
  "Deep work window.": {
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'standard', focus: 'focus' },
    prepare: { type: 'prepare', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'restore' }
  },
  "Protect the peak.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'composure' },
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Close with intention.": {
    regulate: { type: 'regulate', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'composure' },
    align: { type: 'align', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Own your optimal state.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'moderate', duration: 'micro', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: false, priority: 4, intensity: 'moderate', duration: 'short', focus: 'confidence' }
  },
  // NO-CALENDAR FALLBACKS
  "Begin with stillness.": {
    regulate: { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'standard', focus: 'release' }
  },
  "Operate with care.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'restore' },
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Steady and selective.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Lead with confidence.": {
    align: { type: 'align', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'confidence' }
  },
  "Invest your advantage.": {
    align: { type: 'align', required: false, priority: 5, intensity: 'moderate', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Bring your full presence.": {
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Own your peak.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'activating', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: false, priority: 4, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
};

const DEFAULT_MODULE_MAPPING: ThemeModuleMapping = {
  regulate: { type: 'regulate', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'grounding' },
  align: { type: 'align', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'grounding' }
};

// ==================== HELPERS ====================

function getTimeOfDay(timezoneOffset: number): 'morning' | 'afternoon' | 'evening' {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const localHour = (utcHours - (timezoneOffset / 60) + 24) % 24;
  if (localHour >= 5 && localHour < 12) return 'morning';
  if (localHour >= 12 && localHour < 18) return 'afternoon';
  return 'evening';
}

function getLocalDateISO(timezoneOffset: number): string {
  return new Date(Date.now() - timezoneOffset * 60_000).toISOString().split('T')[0];
}

function getModulesFromTheme(themePhrase: string): ThemeModuleMapping {
  if (THEME_MODULE_MAP[themePhrase]) return THEME_MODULE_MAP[themePhrase];
  const normalizedInput = themePhrase.toLowerCase().replace(/[.!?]/g, '').trim();
  for (const [key, value] of Object.entries(THEME_MODULE_MAP)) {
    if (key.toLowerCase().replace(/[.!?]/g, '').trim() === normalizedInput) return value;
  }
  const inputWords = normalizedInput.split(/\s+/).filter(w => w.length > 3);
  for (const [key, value] of Object.entries(THEME_MODULE_MAP)) {
    const keyLower = key.toLowerCase();
    const matchCount = inputWords.filter(w => keyLower.includes(w)).length;
    if (matchCount >= 2 || (inputWords.length === 1 && matchCount === 1)) return value;
  }
  return DEFAULT_MODULE_MAPPING;
}

// ==================== CALENDAR CONTEXT (DENSITY-AWARE) ====================

interface CalendarContext {
  todayLoad: 'light' | 'moderate' | 'heavy' | 'extreme';
  todayMeetingCount: number;
  todayMeetingHours: number;
  upcomingLoad: 'light' | 'moderate' | 'heavy' | 'extreme';
  upcomingMeetingCount: number;
  upcomingMeetingHours: number;
  remainingMeetingCount: number;
}

function classifyLoad(count: number, hours: number): 'light' | 'moderate' | 'heavy' | 'extreme' {
  if (count >= 8 || hours >= 6) return 'extreme';
  if (count >= 6 || hours >= 4) return 'heavy';
  if (count >= 3 || hours >= 2) return 'moderate';
  return 'light';
}

function calculateCalendarContext(
  allDayEvents: any[],
  timeOfDay: 'morning' | 'afternoon' | 'evening'
): CalendarContext {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // All events today (full day)
  const todayEvents = allDayEvents.filter((e: any) => {
    const start = new Date(e.start_time || e.startTime);
    return start.toISOString().split('T')[0] === todayStr;
  });

  const todayMeetingCount = todayEvents.length;
  const todayMeetingHours = todayEvents.reduce((sum: number, e: any) => {
    const start = new Date(e.start_time || e.startTime).getTime();
    const end = new Date(e.end_time || e.endTime).getTime();
    return sum + Math.max(0, (end - start) / 3_600_000);
  }, 0);

  // Upcoming = rest of today (events starting after now)
  const upcomingEvents = todayEvents.filter((e: any) => {
    const start = new Date(e.start_time || e.startTime);
    return start > now;
  });
  const upcomingMeetingCount = upcomingEvents.length;
  const upcomingMeetingHours = upcomingEvents.reduce((sum: number, e: any) => {
    const start = new Date(e.start_time || e.startTime).getTime();
    const end = new Date(e.end_time || e.endTime).getTime();
    return sum + Math.max(0, (end - start) / 3_600_000);
  }, 0);

  return {
    todayLoad: classifyLoad(todayMeetingCount, todayMeetingHours),
    todayMeetingCount,
    todayMeetingHours: Math.round(todayMeetingHours * 10) / 10,
    upcomingLoad: classifyLoad(upcomingMeetingCount, upcomingMeetingHours),
    upcomingMeetingCount,
    upcomingMeetingHours: Math.round(upcomingMeetingHours * 10) / 10,
    remainingMeetingCount: upcomingMeetingCount,
  };
}

function applyCalendarOverrides(
  mapping: ThemeModuleMapping,
  ctx: CalendarContext,
  timeOfDay: 'morning' | 'afternoon' | 'evening',
  tier: string
): ThemeModuleMapping {
  // Deep clone to avoid mutating the original theme map entry
  const m: ThemeModuleMapping = JSON.parse(JSON.stringify(mapping));
  const load = timeOfDay === 'morning' ? ctx.upcomingLoad : ctx.todayLoad;

  // ── MORNING: forward-looking ──
  if (timeOfDay === 'morning') {
    if (load === 'heavy' || load === 'extreme') {
      // Force grounding regulate
      if (!m.regulate) {
        m.regulate = { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'short', focus: 'grounding' };
      } else {
        m.regulate.required = true;
        m.regulate.priority = Math.max(m.regulate.priority, 9);
        m.regulate.intensity = 'gentle';
        m.regulate.focus = 'grounding';
      }
      // Shift align away from activation toward composure
      if (m.align) {
        m.align.focus = 'composure';
        m.align.intensity = 'gentle';
      }
      // Remove prepare (no space for strategic thinking on dense days)
      if (load === 'extreme') delete m.prepare;
    } else if (load === 'light') {
      // Maximize focus + strategic thinking
      if (m.align) {
        m.align.focus = 'focus';
        m.align.intensity = 'activating';
      }
      if (!m.prepare && !m.integrate) {
        m.prepare = { type: 'prepare', required: false, priority: 5, intensity: 'moderate', duration: 'short', focus: 'focus' };
      }
    }
    // moderate: theme mapping is fine as-is
  }

  // ── AFTERNOON: context-dependent ──
  else if (timeOfDay === 'afternoon') {
    if ((load === 'heavy' || load === 'extreme') && (tier === 'depleted' || tier === 'managing')) {
      // Force restoration regulate
      if (!m.regulate) {
        m.regulate = { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'short', focus: 'restore' };
      } else {
        m.regulate.required = true;
        m.regulate.priority = Math.max(m.regulate.priority, 9);
        m.regulate.intensity = 'gentle';
        m.regulate.focus = 'restore';
      }
      // Suppress activating align to prevent further depletion
      if (m.align && m.align.intensity === 'activating') {
        m.align.intensity = 'gentle';
        m.align.focus = 'grounding';
      }
    } else if ((load === 'heavy' || load === 'extreme') && (tier === 'strong' || tier === 'peak')) {
      // Sustained capacity – keep align but ensure regulate present
      if (!m.regulate) {
        m.regulate = { type: 'regulate', required: false, priority: 5, intensity: 'moderate', duration: 'micro', focus: 'composure' };
      }
    }
  }

  // ── EVENING: backward-looking ──
  else if (timeOfDay === 'evening') {
    if (load === 'extreme' || load === 'heavy') {
      // Deep recovery / strong wind-down
      if (m.regulate) {
        m.regulate.required = true;
        m.regulate.focus = 'release';
        m.regulate.intensity = 'gentle';
        if (load === 'extreme') m.regulate.duration = 'standard';
      }
      if (m.align) {
        m.align.focus = 'release';
        m.align.intensity = 'gentle';
      }
    } else if (load === 'light') {
      // Light day → brief wind-down sufficient, strategic reflection OK
      if (m.regulate) {
        m.regulate.priority = Math.max(m.regulate.priority - 2, 3);
        m.regulate.duration = 'micro';
      }
      if (m.align) {
        m.align.focus = m.align.focus === 'release' ? 'grounding' : m.align.focus;
      }
    }
  }

  return m;
}

// ==================== MODULE-DERIVED RATIONALE ====================

function deriveRationaleFromModules(modules: Array<{ type: string; focus: string }>): string {
  const types = new Set(modules.map(m => m.type));
  const focuses = new Set(modules.map(m => m.focus));

  // Module composition mapping
  if (types.has('regulate') && focuses.has('restore')) {
    return 'Nervous system recovery before the load lands – settle the physiology first, everything else follows.';
  }
  if (types.has('regulate') && focuses.has('composure') && !types.has('align')) {
    return 'Interrupt the stress pattern before it compounds – your body is already signalling load.';
  }
  if (types.has('align') && focuses.has('confidence') && !types.has('regulate')) {
    return 'Anchor your presence before you walk in – the thinking is there, this closes the belief gap.';
  }
  if (types.has('align') && focuses.has('focus') && !types.has('regulate')) {
    return 'Sharpen the clarity gap between where you are and where the day needs you to be.';
  }
  if (types.has('regulate') && types.has('align')) {
    return 'Settle the body first, then sharpen the mind – in that order, because the sequence matters.';
  }
  if (types.has('integrate') && types.has('regulate')) {
    return 'Discharge what you carried today before it follows you into tomorrow.';
  }
  if (types.has('integrate')) {
    return 'Close the loop on what happened – named experiences don\'t compound overnight.';
  }
  if (types.has('regulate') && focuses.has('release')) {
    return 'Release what you carried – this prevents rumination and protects your rest.';
  }
  if (types.has('regulate') && focuses.has('grounding')) {
    return 'Ground before you move – stability under load starts with the body.';
  }
  if (types.has('align')) {
    return 'Sharpen your mental edge for what lies ahead.';
  }
  if (types.has('regulate')) {
    return 'Settle your nervous system – this is the foundation for everything else.';
  }
  return 'This sequence addresses what your system needs right now.';
}

function buildUrgencyFrame(
  timeOfDay: 'morning' | 'afternoon' | 'evening',
  nextEventTitle: string | null,
  nextEventMinutes: number | null,
  calendarGapMinutes: number | null,
  calendarLoad: string,
): string {
  // JIT event urgency
  if (nextEventTitle && nextEventMinutes !== null) {
    if (nextEventMinutes <= 45) {
      return `*${nextEventTitle}* in ${nextEventMinutes} minutes. Start now.`;
    }
    if (nextEventMinutes <= 120) {
      const hours = Math.floor(nextEventMinutes / 60);
      const mins = nextEventMinutes % 60;
      const timeStr = hours > 0 ? `${hours}h ${mins > 0 ? mins + 'm' : ''}` : `${mins}m`;
      return `*${nextEventTitle}* is ${timeStr} away. This is your window.`;
    }
  }

  // Calendar gap
  if (calendarGapMinutes !== null && calendarGapMinutes > 0 && calendarGapMinutes <= 60) {
    return `You have ${calendarGapMinutes} minutes before your next block. That's enough – use it.`;
  }

  // Time of day based
  if (timeOfDay === 'evening') {
    return 'The day is done. This closes it properly.';
  }

  const isDense = calendarLoad === 'extreme' || calendarLoad === 'heavy';
  if (isDense) {
    return 'There is no better window than this one.';
  }

  return 'The open space is the asset. Use it deliberately.';
}

export function generatePlanBrief(
  ctx: CalendarContext,
  timeOfDay: 'morning' | 'afternoon' | 'evening',
  innerReadinessTier: string,
  innerReadinessScore: number | null,
  checkInOutcome: string,
  calendarLoad: string,
  wearable: WearableContext,
  outerReadinessPhrase: string,
  outerReadinessContext: string,
  outerReadinessLeanOn: string,
  coachInsights?: any[],
  resolvedModules?: Array<{ type: string; focus: string }>,
  alreadyUsed?: string[],
  nextEventTitle?: string | null,
  nextEventMinutes?: number | null,
  pendingCommitments?: any[],
  calendarGaps?: number[],
): string {
  if (innerReadinessScore == null) {
    const nextGap = calendarGaps && calendarGaps.length > 0 ? calendarGaps.find(g => g > 0 && g <= 60) ?? null : null;
    const urgency = buildUrgencyFrame(timeOfDay, nextEventTitle || null, nextEventMinutes || null, nextGap, calendarLoad);
    return `Readiness signals are still coming in, so today's plan stays neutral and practical. ${urgency}`;
  }

  // Derive rationale from resolved modules (new approach)
  if (resolvedModules && resolvedModules.length > 0) {
    const rationale = deriveRationaleFromModules(resolvedModules);
    
    // Coach memory integration
    let coachFragment = '';
    if (pendingCommitments && pendingCommitments.length > 0 && nextEventTitle) {
      const relevantCommitment = pendingCommitments.find((c: any) => {
        const text = (c.commitment_text || '').toLowerCase();
        const eventWords = (nextEventTitle || '').toLowerCase().split(' ').filter((w: string) => w.length > 3);
        return eventWords.some(w => text.includes(w));
      });
      if (relevantCommitment) {
        coachFragment = ` You committed to working on this – *${nextEventTitle}* is that moment.`;
      }
    }
    if (!coachFragment && coachInsights && coachInsights.length > 0) {
      const growthInsight = coachInsights.find((i: any) => i.type === 'growth_area');
      if (growthInsight?.content && growthInsight.content.length < 80) {
        const pattern = growthInsight.content.toLowerCase().replace(/\.$/, '');
        if (!alreadyUsed?.includes('coach_memory_match')) {
          coachFragment = ` Your coach noted ${pattern} – today's signals are consistent with it.`;
        }
      }
      if (!coachFragment) {
        const relationshipInsight = coachInsights.find((i: any) => i.type === 'relationship_pattern');
        if (relationshipInsight?.content && relationshipInsight.content.length < 120 && !alreadyUsed?.includes('coach_memory_match')) {
          const pattern = relationshipInsight.content.toLowerCase().replace(/\.$/, '');
          coachFragment = ` A recurring relationship pattern is active: ${pattern}.`;
        }
      }
    }

    // Urgency frame
    // Calendar gap: find the smallest upcoming gap for urgency framing
    const nextGap = calendarGaps && calendarGaps.length > 0 ? calendarGaps.find(g => g > 0 && g <= 60) ?? null : null;
    const urgency = buildUrgencyFrame(timeOfDay, nextEventTitle || null, nextEventMinutes || null, nextGap, calendarLoad);

    return `${rationale}${coachFragment} ${urgency}`;
  }

  // ═══ FALLBACK: Legacy brief generation (when resolvedModules not available) ═══
  const count = timeOfDay === 'morning' ? ctx.upcomingMeetingCount : ctx.todayMeetingCount;
  const remainingCount = ctx.remainingMeetingCount ?? count;

  const tierLabel: Record<string, string> = {
    depleted: 'low', managing: 'steady', strong: 'above baseline', peak: 'at peak'
  };
  const readinessWord = tierLabel[innerReadinessTier] || 'steady';

  const poorSleep = wearable.hasData && wearable.sleepScore !== null && wearable.sleepScore < 70;
  const lowHRV = wearable.hasData && wearable.hrvDeviation !== null && wearable.hrvDeviation < -10;
  const goodHRV = wearable.hasData && wearable.hrvDeviation !== null && wearable.hrvDeviation > 5;
  const goodSleep = wearable.hasData && wearable.sleepScore !== null && wearable.sleepScore >= 80;

  let wearableFragment = '';
  if (poorSleep && lowHRV) wearableFragment = ', and your sleep and HRV are both below baseline';
  else if (poorSleep) wearableFragment = ', and your sleep score is below baseline';
  else if (lowHRV) wearableFragment = ', and your HRV is below baseline';
  else if (goodHRV && goodSleep) wearableFragment = ' with recovered HRV and solid sleep';
  else if (goodHRV) wearableFragment = ' with recovered HRV';

  let stateSentence = `Your decision readiness is ${readinessWord} (${innerReadinessScore}/100)${wearableFragment}.`;
  let purposeSentence = 'This sequence addresses what your system needs right now.';

  if (timeOfDay === 'evening') {
    purposeSentence = innerReadinessTier === 'depleted'
      ? 'This sequence helps you release what you carried and protect tomorrow\'s capacity.'
      : 'This sequence helps you close cleanly so you arrive restored tomorrow.';
  } else if (timeOfDay === 'morning') {
    purposeSentence = poorSleep
      ? 'These practices compensate for what rest didn\'t fully restore.'
      : 'These practices set your mental edge for the day ahead.';
  } else {
    purposeSentence = 'This sequence restores your edge for the stretch that remains.';
  }

  return `${stateSentence} ${purposeSentence}`;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ==================== HRV × CALENDAR CORRELATION ====================

interface EventTypeCorrelation {
  eventType: string;
  count: number;
  avgHRVDeviation: number;
  examples: string[];
}

type HRVCorrelationMap = Record<string, EventTypeCorrelation>;

// Coarse event-type token + presentation label — sourced from the shared
// classifier (single source of truth in `_shared/events/event-classifier.ts`).
// No second taxonomy lives in this file.
function extractEventType(title: string): string {
  return coarseEventType(title);
}

async function getHRVEventCorrelations(
  userId: string,
  supabaseClient: any
): Promise<HRVCorrelationMap | null> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [eventsRes, hrvRes] = await Promise.all([
      supabaseClient
        .from('primary_calendar_events')
        .select('start_time, title, id, end_time, provider, attendees_count, is_organizer, is_recurring, event_metadata, external_id')
        .eq('user_id', userId)
        .gte('start_time', thirtyDaysAgo.toISOString())
        .order('start_time', { ascending: true }),
      supabaseClient
        .from('wearable_data')
        .select('summary_date, hrv')
        .eq('user_id', userId)
        .gte('summary_date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('summary_date', { ascending: true }),
    ]);

    const pastEvents = mergeCalendarEvents((eventsRes.data || []) as any[], 'unknown');
    const hrvData = hrvRes.data;

    if (!pastEvents || !hrvData || hrvData.length < 7) return null;

    const baselineHRV = hrvData.reduce((sum: number, d: any) => sum + (d.hrv || 0), 0) / hrvData.length;
    if (baselineHRV <= 0) return null;

    const correlations: Record<string, { count: number; totalDeviation: number; examples: string[] }> = {};

    for (const event of pastEvents) {
      const eventDate = (event.start_time || '').split('T')[0];
      const hrvOnDate = hrvData.find((h: any) => h.summary_date === eventDate);
      if (!hrvOnDate || !hrvOnDate.hrv) continue;

      const deviation = ((hrvOnDate.hrv - baselineHRV) / baselineHRV) * 100;
      const eventType = extractEventType(event.title || '');

      if (!correlations[eventType]) {
        correlations[eventType] = { count: 0, totalDeviation: 0, examples: [] };
      }
      correlations[eventType].count++;
      correlations[eventType].totalDeviation += deviation;
      if (correlations[eventType].examples.length < 3) {
        correlations[eventType].examples.push(event.title || '');
      }
    }

    const result: HRVCorrelationMap = {};
    for (const [type, data] of Object.entries(correlations)) {
      if (data.count >= 2) {
        result[type] = {
          eventType: type,
          count: data.count,
          avgHRVDeviation: Math.round(data.totalDeviation / data.count),
          examples: data.examples,
        };
      }
    }

    console.log(`[generate-mastery-plan] HRV correlations: ${Object.keys(result).length} event types with 2+ occurrences`);
    return Object.keys(result).length > 0 ? result : null;
  } catch (err) {
    console.error('[generate-mastery-plan] HRV correlation error:', err);
    return null;
  }
}

// ==================== UNIFIED THRESHOLD ====================
const JIT_THRESHOLD_UNIFIED = 55;

// ==================== TWO-TOUCH ACTION WINDOWS ====================
// Touch 2 (0-6h): body + state prep. Touch 1 (6-48h): coach + think prep.
// Selection-only (>48h): scored but not surfaced.
// Suppression is per-event via dismissed_horizons and skippedTypes3Plus – no blanket silent window.
function getActionWindow(minutesUntil: number): 'touch1' | 'touch2' | 'selection_only' {
  if (minutesUntil <= 360) return 'touch2';           // 0-6h: body prep
  if (minutesUntil <= 2880) return 'touch1';          // 6-48h: coach + think prep
  return 'selection_only';                              // >48h: scored but not surfaced
}

// ==================== NOISE FILTER ====================
// Delegates to the shared executive-state taxonomy so noise rules stay
// identical across smart-nudges, JIT, brief, mastery-plan, and cause-effect.
function isNoiseEvent(title: string): boolean {
  return isNoiseTitle(title);
}

// ==================== DIM A/B FLOOR GUARDS ====================
// DimA (attendee + pressure) and DimB (cluster signal) are derived from the
// shared classifier — no second taxonomy lives in this file. See
// `_shared/events/event-classifier.ts` for `eventPressureFlag` and
// `eventClusterSignal`.

function computeLegacyDimA(title: string, attendeeCount: number): number {
  if (attendeeCount === 0) return 0;
  let score = attendeeCount <= 2 ? 12 : 20;
  if (eventPressureFlag(title)) {
    score = Math.min(35, score + 15);
  }
  return score;
}

function computeLegacyDimB(title: string): number {
  return eventClusterSignal(title) ? 15 : 0;
}

type RelationshipTag = 'boss' | 'colleague' | 'junior' | 'vendor' | 'client' | 'other';

function inferRelationshipTag(title: string, metadata: any, attendeeCount: number): { tag: RelationshipTag | null; reason: string | null } {
  const lower = `${title || ''} ${JSON.stringify(metadata || {})}`.toLowerCase();
  if (/(client|customer|account|proposal|demo|vendor|supplier|partner)/.test(lower)) {
    return { tag: /vendor|supplier|partner/.test(lower) ? 'vendor' : 'client', reason: 'relationship keywords' };
  }
  if (/(1:1|one-on-one|one on one|feedback|review|performance|manager|boss|director|vp|leadership|skip level)/.test(lower)) {
    return { tag: 'boss', reason: 'managerial or feedback keywords' };
  }
  if (/(direct report|mentee|coaching|onboarding|candidate|interview|junior)/.test(lower)) {
    return { tag: 'junior', reason: 'mentoring or candidate keywords' };
  }
  if (/(team|sync|standup|stand-up|working session|planning|retro)/.test(lower)) {
    return { tag: 'colleague', reason: 'peer collaboration keywords' };
  }
  const attendeeSignals = metadata?.attendeeSignals;
  const attendees = Array.isArray(attendeeSignals?.attendees) ? attendeeSignals.attendees : [];
  if (attendeeCount >= 5 && attendees.some((a: any) => a?.responseStatus === 'declined')) {
    return { tag: 'client', reason: 'large meeting with declined attendees' };
  }
  if (attendeeCount >= 6) {
    return { tag: 'client', reason: 'large multi-party meeting' };
  }
  return { tag: null, reason: null };
}

// ==================== CALENDAR EVENT PRIORITISATION ====================

interface ScoredEvent {
  event: CalendarEvent;
  score: number;
  minutesUntil: number;
  scenario: ExecutiveScenario | null;
  timePill: string;
  contextDescription: string;
  hrvCorrelation?: {
    eventType: string;
    avgDeviation: number;
    historicalCount: number;
  };
  // New pipeline fields (populated from jit_event_context bridge)
  jitBucketPrimary?: string | null;
  jitBucketSecondary?: string | null;
  jitConfidenceScore?: number | null;
  jitConfidenceBand?: string | null;
  jitUrgencyHorizon?: string | null;
  jitDimensionScores?: any | null;
}

function formatTimePill(minutesUntil: number): string {
  if (minutesUntil < 60) return `In ${minutesUntil} min`;
  if (minutesUntil < 1440) {
    const hours = Math.floor(minutesUntil / 60);
    return `In ${hours} hr${hours > 1 ? 's' : ''}`;
  }
  const days = Math.ceil(minutesUntil / 1440);
  return `In ${days} day${days > 1 ? 's' : ''}`;
}

function getCalendarEventStartIso(
  event: Partial<CalendarEvent> & { start_time?: string | null },
): string | null {
  return event.startTime ?? event.start_time ?? null;
}

function getCalendarEventEndIso(
  event: Partial<CalendarEvent> & { end_time?: string | null },
): string | null {
  return event.endTime ?? event.end_time ?? null;
}

function findScoredEventForCandidate(
  events: ScoredEvent[],
  candidate: RankedJitCandidate,
): ScoredEvent | null {
  const byId = candidate.eventId
    ? events.find((evt) => evt.event.id === candidate.eventId)
    : null;
  if (byId) return byId;

  const title = String(candidate.title || '').trim().toLowerCase();
  if (!title) return null;
  return events.find((evt) => String(evt.event.title || '').trim().toLowerCase() === title) ?? null;
}

function buildAnchorSnapshot(
  eventId: string | null,
  enriched: ReturnType<typeof enrichEvent> | null,
  eventTitle?: string | null,
): Pick<
  HorizonModule,
  'anchorEventId' | 'anchorEventTitle' | 'anchorCategoryId' | 'anchorSubtypeId' | 'anchorScenarioId' | 'anchorLeadTimeMin'
> {
  return {
    anchorEventId: eventId ?? null,
    anchorEventTitle: eventTitle ?? null,
    anchorCategoryId: enriched?.categoryId ?? null,
    anchorSubtypeId: enriched?.subtype?.id ?? null,
    anchorScenarioId: enriched?.scenarioId ?? null,
    anchorLeadTimeMin: enriched?.leadTimeMin ?? null,
  };
}

function buildSharedContextDescription(
  event: CalendarEvent,
  candidate: RankedJitCandidate,
  minutesUntil: number,
  hrvCorrelations: HRVCorrelationMap | null,
): { contextDescription: string; hrvCorrelation?: ScoredEvent['hrvCorrelation'] } {
  const parts: string[] = [];
  const scenarioLabel = canonicalEventTag(event.title || '');
  const phaseVerb =
    candidate.phase === 'pre'
      ? 'Prepare ahead of'
      : candidate.phase === 'during'
      ? 'Stay regulated through'
      : 'Recover cleanly after';
  parts.push(`${phaseVerb} ${scenarioLabel.toLowerCase()}`);

  const enriched = enrichEvent({ title: event.title || '' });
  if (candidate.phase === 'pre' && candidate.leadTimeMin != null) {
    parts.push(`shared timing window is active (${candidate.leadTimeMin} min lead)`);
  }
  if (candidate.phase === 'post' && enriched.categoryId) {
    parts.push(`protect the ${EVENT_CATEGORIES[enriched.categoryId].name.toLowerCase()} recovery window`);
  }
  if (minutesUntil <= 30) parts.push('starting very soon');
  else if (minutesUntil <= 120) parts.push(`in ${minutesUntil} minutes`);
  else if (minutesUntil < 1440) parts.push(`in ${Math.floor(minutesUntil / 60)} hours`);

  let hrvCorrelation: ScoredEvent['hrvCorrelation'] = undefined;
  if (hrvCorrelations) {
    const evtType = coarseEventType(event.title || '');
    const corr = hrvCorrelations[evtType];
    if (corr && corr.count >= 2) {
      hrvCorrelation = {
        eventType: evtType,
        avgDeviation: corr.avgHRVDeviation,
        historicalCount: corr.count,
      };
      if (Math.abs(corr.avgHRVDeviation) > 10) {
        const canonicalLabel = canonicalTagForCoarse(evtType);
        parts.push(`your body shows a familiar pre-${canonicalLabel.toLowerCase().replace(/^pre /, '')} response`);
      }
    }
  }

  return {
    contextDescription: `${parts.join(' – ')}. Prepare with targeted practice.`,
    hrvCorrelation,
  };
}

function scoreCalendarEventsShared(
  events: CalendarEvent[],
  hrvCorrelations?: HRVCorrelationMap | null,
  memoryIndex?: PriorityMemoryIndex | null,
): ScoredEvent[] {
  const nowMs = Date.now();
  const eligibleEvents = events
    .filter((event) => !!event?.title)
    .filter((event) => !isNoiseEvent(event.title || ''))
    .filter((event) => !(isEducationalTitle(event.title || '') && !event.isOrganizer));

  const ranked = rankJitCandidates(
    eligibleEvents.map((event) => {
      let memoryDelta = 0;
      let memoryHardDemote = false;
      if (memoryIndex) {
        const mem = applyEventPriorityMemory(memoryIndex, {
          eventCategory: coarseEventType(event.title || ''),
          eventTypeKey: normalizeEventTypeKey(event.title || ''),
        });
        memoryDelta = mem.delta;
        memoryHardDemote = mem.hardDemote;
      }
      return {
        event: {
          id: event.id,
          title: event.title,
          start_time: event.startTime,
          end_time: event.endTime ?? null,
        },
        stakesLevel: null,
        memoryDelta,
        memoryHardDemote,
      };
    }),
    nowMs,
  );

  const bestCandidateByEvent = new Map<string, RankedJitCandidate>();
  for (const candidate of ranked) {
    if (!candidate.eventId) continue;
    const current = bestCandidateByEvent.get(candidate.eventId);
    if (!current || candidate.score > current.score) {
      bestCandidateByEvent.set(candidate.eventId, candidate);
    }
  }

  const scored: ScoredEvent[] = [];
  for (const event of eligibleEvents) {
    const startMs = new Date(event.startTime).getTime();
    if (!Number.isFinite(startMs)) continue;
    const minutesUntil = Math.floor((startMs - nowMs) / (1000 * 60));
    if (minutesUntil < 0) continue;
    const actionWindow = getActionWindow(minutesUntil);
    if (actionWindow === 'selection_only') continue;

    const candidate = bestCandidateByEvent.get(event.id);
    if (!candidate) continue;
    const sid = scenarioIdFor(event.title);
    const scenario = sid ? EXECUTIVE_SCENARIOS.find((s) => s.id === sid) || null : null;
    const { contextDescription, hrvCorrelation } = buildSharedContextDescription(
      event,
      candidate,
      minutesUntil,
      hrvCorrelations ?? null,
    );

    scored.push({
      event,
      score: candidate.score,
      minutesUntil,
      scenario,
      timePill: formatTimePill(minutesUntil),
      contextDescription,
      hrvCorrelation,
      jitUrgencyHorizon: actionWindow === 'touch1' ? 'tactical' : 'immediate',
    });
  }

  scored.sort((a, b) => b.score - a.score || a.minutesUntil - b.minutesUntil);
  return scored;
}

/**
 * Bridge: Try to use pre-scored events from jit_event_context (new pipeline).
 * Falls back to a shared ranked-candidate scorer if no pre-scored events are available.
 */
async function getPreScoredEvents(
  userId: string,
  calendarEvents: CalendarEvent[],
  supabaseClient: any,
  hrvCorrelations: HRVCorrelationMap | null,
  memoryIndex?: PriorityMemoryIndex | null,
): Promise<ScoredEvent[]> {
  const now = new Date();

  // Query jit_event_context for recent pre-scored events (within last 60 min)
  try {
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
    const { data: jitContextRows } = await supabaseClient
      .from('jit_event_context')
      .select('calendar_event_id, event_title, event_type, event_start, final_score, context_statement, jit_bucket_primary, jit_bucket_secondary, jit_confidence_score, jit_urgency_horizon, jit_dimension_scores, has_coach_context, coach_scenario, expressed_concern, has_pending_tool, dismissed_by_user, dismissed_horizons')
      .eq('user_id', userId)
      .eq('shown_in_jit', true)
      .gte('updated_at', twelveHoursAgo)
      .gte('event_start', now.toISOString())
      .order('final_score', { ascending: false })
      .limit(5);

    if (jitContextRows && jitContextRows.length > 0) {
      console.log(`[generate-mastery-plan] Bridge: found ${jitContextRows.length} pre-scored events from jit_event_context`);
      
      const bridgedEvents: ScoredEvent[] = [];
      for (const row of jitContextRows) {
        // Find matching calendar event for full metadata
        const matchingEvent = calendarEvents.find(e => e.id === row.calendar_event_id);
        const eventStart = new Date(row.event_start);
        const minutesUntil = Math.floor((eventStart.getTime() - now.getTime()) / (1000 * 60));
        if (minutesUntil < 0) continue;

        // Educational non-organizer hard gate – completely block, no override
        const isEducational = isEducationalTitle(row.event_title || '');
        const isOrganizer = matchingEvent?.isOrganizer ?? false;
        if (isEducational && !isOrganizer) {
          console.log(`[generate-mastery-plan] Bridge: BLOCKED educational non-organizer "${row.event_title}"`);
          continue;
        }

        // ═══ TWO-TOUCH ACTION WINDOW FILTER ═══
        // Only include events in valid action windows (touch1 or touch2)
        const actionWindow = getActionWindow(minutesUntil);
        if (actionWindow === 'selection_only') {
          console.log(`[generate-mastery-plan] Bridge: EXCLUDED "${row.event_title}" – window=${actionWindow} minutesUntil=${minutesUntil} score=${row.final_score}`);
          continue;
        }

        // ═══ PER-TOUCH DISMISSAL CHECK ═══
        // Check if this specific touch has been dismissed (not the whole event)
        const touchLabel = actionWindow === 'touch1' ? 'touch_1' : 'touch_2';
        const dismissedHorizons: string[] = row.dismissed_horizons || [];
        if (dismissedHorizons.includes(touchLabel)) {
          console.log(`[generate-mastery-plan] Bridge: skipping "${row.event_title}" – ${touchLabel} dismissed`);
          continue;
        }

        // Build enriched context description from pipeline signals
        const contextDescription = buildEnrichedContextDescription(row, minutesUntil, matchingEvent, hrvCorrelations);

        // Find matching scenario for module selection
        // Scenario lookup goes through the shared taxonomy: classifyEvent →
        // EVENT_TYPE_TO_SCENARIO_ID → ExecutiveScenario.id. Single source of
        // truth for keywords; bespoke ModuleSpecs stay here.
        let matchedScenario: ExecutiveScenario | null = null;
        const sid = scenarioIdFor(row.event_title);
        if (sid) {
          matchedScenario = EXECUTIVE_SCENARIOS.find(s => s.id === sid) || null;
        }

        // Build HRV correlation from existing correlations
        let hrvCorrelation: ScoredEvent['hrvCorrelation'] = undefined;
        if (hrvCorrelations) {
          const evtType = extractEventType(row.event_title || '');
          const corr = hrvCorrelations[evtType];
          if (corr && corr.count >= 2) {
            hrvCorrelation = {
              eventType: evtType,
              avgDeviation: corr.avgHRVDeviation,
              historicalCount: corr.count,
            };
          }
        }

        bridgedEvents.push({
          event: matchingEvent || {
            id: row.calendar_event_id,
            title: row.event_title,
            startTime: row.event_start,
          } as CalendarEvent,
          score: row.final_score || 0,
          minutesUntil,
          scenario: matchedScenario,
          timePill: formatTimePill(minutesUntil),
          contextDescription,
          hrvCorrelation,
          jitBucketPrimary: row.jit_bucket_primary,
          jitBucketSecondary: row.jit_bucket_secondary,
          jitConfidenceScore: row.jit_confidence_score,
          jitConfidenceBand: row.jit_confidence_score != null
            ? (row.jit_confidence_score >= 70 ? 'high' : row.jit_confidence_score >= 40 ? 'medium' : row.jit_confidence_score >= 20 ? 'low' : 'none')
            : null,
          jitUrgencyHorizon: row.jit_urgency_horizon,
          jitDimensionScores: row.jit_dimension_scores,
        });
      }

      if (bridgedEvents.length > 0) {
        return bridgedEvents;
      }
    }
  } catch (err) {
    console.error('[generate-mastery-plan] jit_event_context bridge error:', err);
  }

  // Fallback: shared ranked-candidate scoring (no jit_event_context rows yet)
  console.log('[generate-mastery-plan] Bridge: no pre-scored events, falling back to shared ranked-candidate scoring');
  return scoreCalendarEventsShared(calendarEvents, hrvCorrelations, memoryIndex);
}

/**
 * Build enriched context description from pipeline signals.
 * Incorporates bucket classification, coach memory, HRV context, and confidence framing.
 */
function buildEnrichedContextDescription(
  row: any,
  minutesUntil: number,
  matchingEvent: CalendarEvent | undefined,
  hrvCorrelations: HRVCorrelationMap | null,
): string {
  const parts: string[] = [];
  const bucket = row.jit_bucket_primary;

  // Bucket-driven reasoning (module-composition style)
  if (bucket === 'recalibrate') {
    parts.push('Interrupt the stress pattern before it compounds');
  } else if (bucket === 'clarity') {
    parts.push('Sharpen your approach before the stakes arrive');
  } else if (bucket === 'renewal') {
    parts.push('Sustain energy through this transition');
  }

  // Coach memory signal – specific, not generic
  if (row.has_coach_context) {
    if (row.expressed_concern) {
      parts.push('you\'ve explored this concern in coaching – this is that moment');
    } else if (row.coach_scenario) {
      parts.push('your coach has noted a pattern here');
    } else if (row.has_pending_tool) {
      parts.push('a coach-recommended approach applies');
    }
  }

  // HRV historical correlation – pattern reference, not raw number
  if (hrvCorrelations) {
    const evtType = extractEventType(row.event_title || '');
    const corr = hrvCorrelations[evtType];
    if (corr && corr.count >= 2 && Math.abs(corr.avgHRVDeviation) > 10) {
      const canonicalLabel = canonicalTagForCoarse(evtType);
      parts.push(`your body shows a familiar pre-${canonicalLabel.toLowerCase().replace(/^pre /, '')} response`);
    }
  }

  const attendeeHint = inferRelationshipTag(
    matchingEvent?.title || row.event_title || '',
    matchingEvent?.eventMetadata || null,
    matchingEvent?.attendeesCount || row.attendee_count || 0,
  );
  if (attendeeHint.tag) {
    if (attendeeHint.tag === 'client') parts.push('client-facing relationship pressure');
    else if (attendeeHint.tag === 'boss') parts.push('manager-level interpersonal load');
    else if (attendeeHint.tag === 'junior') parts.push('people-development work');
    else if (attendeeHint.tag === 'vendor') parts.push('vendor coordination');
    else parts.push('peer coordination');
  }

  // Urgency frame
  if (minutesUntil <= 30) {
    parts.push('starting very soon – start now');
  } else if (minutesUntil <= 60) {
    parts.push(`in ${minutesUntil} minutes – this is your window`);
  } else if (minutesUntil < 1440) {
    const hrs = Math.floor(minutesUntil / 60);
    parts.push(`in ${hrs} hour${hrs > 1 ? 's' : ''}`);
  } else {
    parts.push(`in ${Math.ceil(minutesUntil / 1440)} days`);
  }

  // Build final string with event title in italics
  const eventTitle = row.event_title || 'Upcoming event';
  const prefix = `*${eventTitle}*`;

  if (parts.length === 0) {
    return `${prefix}. Prepare with targeted practice.`;
  }

  // Confidence-framed closing
  const confidenceScore = row.jit_confidence_score || 0;
  if (confidenceScore >= 70) {
    return `${prefix} – ${parts.join('. ')}.`;
  } else if (confidenceScore >= 40) {
    return `${prefix} – ${parts.join('. ')}.`;
  }

  return `${prefix} – ${parts.join('. ')}.`;
}

/**
 * Legacy scoring – kept as fallback when jit_event_context has no recent data.
 * Enforces: noise filter, two-touch action windows, unified ≥55 threshold,
 * and Dim A≥10 + Dim B≥8 floor guards.
 */
function scoreCalendarEventsLegacy(events: CalendarEvent[], skippedTypes: string[], hrvCorrelations?: HRVCorrelationMap | null): ScoredEvent[] {
  const now = new Date();
  const scored: ScoredEvent[] = [];

  const sortedEvents = [...events].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  for (let ei = 0; ei < sortedEvents.length; ei++) {
    const event = sortedEvents[ei];
    const startTime = new Date(event.startTime);
    const minutesUntil = Math.floor((startTime.getTime() - now.getTime()) / (1000 * 60));
    if (minutesUntil < 0) continue;

    // ═══ NOISE FILTER ═══
    if (isNoiseEvent(event.title || '')) continue;

    // Educational non-organizer guard in legacy fallback path
    const isEducational = isEducationalTitle(event.title || '');
    if (isEducational && !event.isOrganizer) continue;

    // ═══ TWO-TOUCH ACTION WINDOW ═══
    const actionWindow = getActionWindow(minutesUntil);
    if (actionWindow === 'selection_only') continue;

    let score = 0;
    const titleLower = (event.title || '').toLowerCase();

    // Immediacy scoring (touch2 0-6h and touch1 6-48h windows)
    if (minutesUntil <= 120) score += 40;
    else if (minutesUntil <= 240) score += 30;
    else if (minutesUntil <= 360) score += 20;
    else if (minutesUntil <= 2880) score += 10;

    if (event.isOrganizer) score += 15;
    if ((event.attendeesCount || 0) > 5) score += 10;
    const relationshipHint = inferRelationshipTag(event.title || '', event.eventMetadata || null, event.attendeesCount || 0);
    if (relationshipHint.tag === 'client' || relationshipHint.tag === 'boss') score += 6;
    else if (relationshipHint.tag) score += 3;
    if (event.endTime) {
      const durationMin = (new Date(event.endTime).getTime() - startTime.getTime()) / 60000;
      if (durationMin > 60) score += 8;
    }
    if (!event.isRecurring) score += 10;

    let matchedScenario: ExecutiveScenario | null = null;
    {
      const sid = scenarioIdFor(event.title);
      if (sid) {
        const found = EXECUTIVE_SCENARIOS.find(s => s.id === sid) || null;
        if (found) {
          score += 25;
          matchedScenario = found;
        }
      }
    }

    const eventHour = startTime.getHours();
    if ((eventHour >= 9 && eventHour <= 12) || (eventHour >= 14 && eventHour <= 16)) score += 5;

    if (ei > 0) {
      const prevEvent = sortedEvents[ei - 1];
      if (prevEvent.endTime) {
        const prevEnd = new Date(prevEvent.endTime);
        const gapMinutes = (startTime.getTime() - prevEnd.getTime()) / 60000;
        if (gapMinutes >= 0 && gapMinutes < 15) score += 5;
      }
    }

    const eventType = matchedScenario?.id || 'general';
    if (skippedTypes.includes(eventType)) score -= 15;

    // ═══ DIM A/B FLOOR GUARDS ═══
    const dimA = computeLegacyDimA(event.title || '', event.attendeesCount || 0);
    const dimB = computeLegacyDimB(event.title || '');
    if (score < JIT_THRESHOLD_UNIFIED || dimA < 10 || dimB < 8) {
      console.log(`[generate-mastery-plan] Legacy GATE FAIL: "${event.title}" score=${score} dimA=${dimA} dimB=${dimB}`);
      continue;
    }

    // HRV correlation boost
    let hrvCorrelation: ScoredEvent['hrvCorrelation'] = undefined;
    let hrvContextPart = '';
    if (hrvCorrelations) {
      const evtType = extractEventType(event.title || '');
      const correlation = hrvCorrelations[evtType];
      if (correlation && correlation.count >= 2) {
        const avgDev = correlation.avgHRVDeviation;
        hrvCorrelation = { eventType: evtType, avgDeviation: avgDev, historicalCount: correlation.count };
        const canonicalLabel = canonicalTagForCoarse(evtType);
        if (avgDev > 20) { score += 25; hrvContextPart = `Your HRV typically elevates ${Math.abs(avgDev)}% during ${canonicalLabel.toLowerCase()} events – your system responds strongly to these.`; }
        else if (avgDev > 15) { score += 20; hrvContextPart = `Your HRV typically elevates ${Math.abs(avgDev)}% during ${canonicalLabel.toLowerCase()} events.`; }
        else if (avgDev > 10) { score += 12; hrvContextPart = `Your HRV tends to elevate during ${canonicalLabel.toLowerCase()} events (${Math.abs(avgDev)}% above baseline).`; }
        else if (avgDev < -10) { score -= 5; }
      }
    }

    let timePill: string;
    if (minutesUntil < 60) timePill = `In ${minutesUntil} min`;
    else if (minutesUntil < 1440) { const hours = Math.floor(minutesUntil / 60); timePill = `In ${hours} hr${hours > 1 ? 's' : ''}`; }
    else { const days = Math.ceil(minutesUntil / 1440); timePill = `In ${days} day${days > 1 ? 's' : ''}`; }

    // ═══ CONTEXT DESCRIPTION – HIDE IF LOW CONFIDENCE ═══
    // Only show context if dimA + dimB signals are strong enough
    let contextDescription = '';
    if (dimA + dimB >= 22) {
      const contextParts: string[] = [];
      if (matchedScenario) {
        const evtTypeForContext = extractEventType(event.title || '');
        const canonicalTagForContext = canonicalTagForCoarse(evtTypeForContext) || matchedScenario.contextLabel || 'meeting';
        contextParts.push(`Upcoming ${canonicalTagForContext.toLowerCase()} detected`);
      } else if ((event.attendeesCount || 0) > 5) {
        contextParts.push(`Large meeting with ${event.attendeesCount} attendees`);
      }
      if (relationshipHint.tag) {
        if (relationshipHint.tag === 'client') contextParts.push('client-facing relationship load');
        else if (relationshipHint.tag === 'boss') contextParts.push('managerial relationship pressure');
        else if (relationshipHint.tag === 'junior') contextParts.push('people-development relationship load');
        else if (relationshipHint.tag === 'vendor') contextParts.push('vendor coordination load');
        else contextParts.push('peer coordination load');
      }
      // Removed: generic "You're organizing this event" – not a justifiable context reason
      if (minutesUntil <= 30) contextParts.push(`starting very soon – prepare now`);
      else if (minutesUntil <= 60) contextParts.push(`in ${minutesUntil} minutes`);
      else if (minutesUntil < 1440) contextParts.push(`in ${Math.floor(minutesUntil / 60)} hours`);
      else contextParts.push(`in ${Math.ceil(minutesUntil / 1440)} days`);
      if (!event.isRecurring && (event.attendeesCount || 0) > 3) contextParts.push(`non-recurring high-visibility event`);
      if (hrvContextPart) contextParts.push(hrvContextPart);
      contextDescription = contextParts.length > 0
        ? contextParts.join(' – ') + '. Prepare with targeted practice.'
        : '';
    }

    scored.push({
      event, score, minutesUntil, scenario: matchedScenario, timePill, contextDescription, hrvCorrelation,
      // Store action window as horizon for plan composition
      jitUrgencyHorizon: actionWindow === 'touch1' ? 'tactical' : 'immediate',
    });
  }

  scored.sort((a, b) => b.score - a.score || a.minutesUntil - b.minutesUntil);
  return scored;
}

// ==================== DURATION CEILING ====================

function getDurationCeiling(calendarLoad: string): { maxDuration: number; maxModules: number } {
  switch (calendarLoad) {
    case 'low': return { maxDuration: 15, maxModules: 4 };
    case 'medium': return { maxDuration: 10, maxModules: 3 };
    case 'high': return { maxDuration: 5, maxModules: 2 };
    default: return { maxDuration: 10, maxModules: 3 }; // no calendar
  }
}

// ==================== CONTENT SCORING ====================

// Mapping from practice_priority_tag to focus tags for content matching
const PRIORITY_TAG_FOCUS_MAP: Record<string, string[]> = {
  regulation_composure: ['composure', 'grounding', 'calm'],
  regulation_early: ['composure', 'restore', 'breathing'],
  recovery_resilience: ['restore', 'release', 'recovery'],
  energy_endurance: ['restore', 'grounding', 'energy'],
  focus_clarity: ['focus', 'grounding', 'clarity'],
  mindset_reframe: ['confidence', 'focus', 'reframe'],
};

// Mapping from pressure_context_tag to focus tags for content matching
const PRESSURE_TAG_FOCUS_MAP: Record<string, string[]> = {
  high_stakes_decisions: ['composure', 'clarity', 'focus'],
  influence_stakeholders: ['confidence', 'composure', 'presence'],
  conflict_navigation: ['composure', 'grounding', 'calm'],
  self_regulation: ['grounding', 'restore', 'breathing'],
  cognitive_load: ['focus', 'grounding', 'clarity'],
};

function calculateContentScore(
  content: any,
  moduleSpec: ModuleSpec,
  favorites: string[],
  coachInsights: any[],
  effectiveContent: string[],
  completedToday: string[],
  practicePriorityTag?: string,
  pressureContextTag?: string,
  pendingCommitments?: any[]
): number {
  let score = 0;
  const hasFavorites = favorites.length > 0;
  const hasCoachInsights = coachInsights?.length > 0;

  if (favorites.includes(content.id)) score += 30;
  if (coachInsights?.some((i: any) => i.contentReference === content.id || (i.content && content.title && content.title.toLowerCase().includes(i.content.toLowerCase().split(' ').find((w: string) => w.length > 3) || '')))) score += 25;
  if (effectiveContent?.includes(content.id)) score += 20;

  // Intensity match
  const intensityMap: Record<string, string> = { gentle: 'low', moderate: 'medium', activating: 'high' };
  if (content.structured_tags?.intensityLevel === intensityMap[moduleSpec.intensity]) score += 15;

  // Duration match
  const dur = content.duration || 0;
  if (moduleSpec.duration === 'micro' && dur <= 2) score += 10;
  else if (moduleSpec.duration === 'short' && dur > 2 && dur <= 5) score += 10;
  else if (moduleSpec.duration === 'standard' && dur > 5 && dur <= 15) score += 10;

  // Focus match (general)
  if (content.structured_tags?.goalTags?.some((t: string) => t.toLowerCase().includes(moduleSpec.focus))) score += 10;
  else if (content.tags?.some((t: string) => t.toLowerCase().includes(moduleSpec.focus))) score += 10;

  // Onboarding signal boosts – full weight when no dynamic signals exist, decayed otherwise
  // Priority boost kept moderate (+20/+7) — onboarding goal is a system recommendation,
  // not explicit user behaviour. Actual behaviour (favorites +30, coach +25) always outweighs.
  const onboardingFullWeight = !hasFavorites && !hasCoachInsights;
  const priorityBoost = onboardingFullWeight ? 20 : 7;
  const pressureBoost = onboardingFullWeight ? 8 : 3;

  // Practice priority tag match (+20 full / +7 decayed)
  if (practicePriorityTag) {
    const focusTags = PRIORITY_TAG_FOCUS_MAP[practicePriorityTag] || [];
    const contentTags = [
      ...(content.structured_tags?.goalTags || []),
      ...(content.tags || [])
    ].map((t: string) => t.toLowerCase());
    if (focusTags.some(ft => contentTags.some((ct: string) => ct.includes(ft)))) {
      score += priorityBoost;
    }
  }

  // Pressure context tag match (+8 full / +3 decayed)
  if (pressureContextTag) {
    const focusTags = PRESSURE_TAG_FOCUS_MAP[pressureContextTag] || [];
    const contentTags = [
      ...(content.structured_tags?.goalTags || []),
      ...(content.tags || [])
    ].map((t: string) => t.toLowerCase());
    if (focusTags.some(ft => contentTags.some((ct: string) => ct.includes(ft)))) {
      score += pressureBoost;
    }
  }

  // Recency - not completed in last 3 days (simplified: not completed today)
  if (!completedToday.includes(content.id)) score += 5;

  // Coach commitment boost: if user committed to a practice, boost matching content
  if (pendingCommitments && pendingCommitments.length > 0) {
    for (const commitment of pendingCommitments) {
      if (commitment.target_practice_id && commitment.target_practice_id === content.id) {
        score += 15;
        break;
      }
      // Also check if commitment text mentions content tags
      if (commitment.commitment_text) {
        const commitLower = (commitment.commitment_text as string).toLowerCase();
        const contentTags = [...(content.tags || []), content.title || ''].map((t: string) => t.toLowerCase());
        if (contentTags.some((t: string) => t.length > 3 && commitLower.includes(t))) {
          score += 10;
          break;
        }
      }
    }
  }

  return score;
}

// ==================== COACH CARD GENERATION ====================

function generateCoachCard(
  type: 'prepare' | 'integrate',
  timeOfDay: string,
  tier: string,
  patternInsight: any,
  eventTitle?: string,
  minutesUntil?: number,
  stateHash?: string,
): any | null {
  // State-versioned ID: ensures completions from a prior state don't suppress new coach work
  const stateSegment = stateHash ? `:${stateHash.substring(0, 8)}` : '';

  // COACH INCLUSION RULES
  if (type === 'prepare') {
    // Pre-event: always include
    if (eventTitle) {
      return {
        id: `coach-prepare${stateSegment}`,
        type: 'prepare',
        label: 'Prepare',
        protocolType: 'Self Mastery Coach',
        title: 'Mental Rehearsal',
        duration: 2,
        sortOrder: 3,
        isCoachCard: true,
        prompt: `You have "${eventTitle}" in ${minutesUntil || '?'} minutes. What outcome would make this a success for you?`
      };
    }
    // Afternoon: only with executive scenario (caller handles this)
    return {
      id: `coach-prepare${stateSegment}`,
      type: 'prepare',
      label: 'Prepare',
      protocolType: 'Self Mastery Coach',
      title: 'Mental Rehearsal',
      duration: 2,
      sortOrder: 3,
      isCoachCard: true,
      prompt: "I have an important moment coming up. Help me mentally prepare and visualize success."
    };
  }

  // Integrate (evening coach)
  if (type === 'integrate') {
    // Coach feature is suppressed (see mem://features/coach/suppression-standard).
    // The evening Reflection Corner is rendered inline by the client based on
    // `type === 'integrate'`; it does not require a coach card to exist.
    // Returning null here prevents the SM Coach thumbnail from being hard-coded
    // into the evening slot.
    return null;
  }

  return null;
}

function getCoachPromptForContext(
  timeOfDay: string,
  tier: string,
  patternInsight: any,
  innerReadinessScore?: number | null,
  calendarPressure?: string,
  hasCoachFavorite?: boolean,
  hasPreEventWithin4h?: boolean
): { prompt: string; title: string } | null {
  // Evening coach prompt suppressed — coach feature is off. Reflection Corner
  // is rendered inline on the integrate slot without a coach prompt.
  if (timeOfDay === 'evening') {
    return null;
  }

  // Morning coach decision tree
  if (timeOfDay === 'morning') {
    // Depleted or managing: always include
    if (tier === 'depleted' || tier === 'managing') {
      if (patternInsight && patternInsight.count >= 3) {
        return {
          prompt: `You've been feeling ${patternInsight.state} for ${patternInsight.count} days. This pattern often signals something deeper – what's been weighing on you?`,
          title: 'Pattern Check-in'
        };
      }
      if (tier === 'depleted') {
        return {
          prompt: "You're running low coming into the day. What's one thing you can genuinely let go of before you move into it?",
          title: 'Morning Reset'
        };
      }
      return {
        prompt: "You're operational. What's the most important thing you want to carry well today?",
        title: 'Morning Focus'
      };
    }
    // Strong/peak: include only if consecutive low pattern, high pressure, or coach favourite
    if (patternInsight && patternInsight.count >= 3) {
      return {
        prompt: `You've been feeling ${patternInsight.state} for ${patternInsight.count} days. This pattern often signals something deeper – what's been weighing on you?`,
        title: 'Pattern Check-in'
      };
    }
    if (calendarPressure === 'high') {
      if (tier === 'strong') {
        return {
          prompt: "You're well-resourced. Where do you most want to direct that today?",
          title: 'Morning Direction'
        };
      }
      return {
        prompt: "You're at your best. What does making the most of today actually look like – specifically?",
        title: 'Morning Precision'
      };
    }
    if (hasCoachFavorite) {
      if (tier === 'strong') {
        return {
          prompt: "You're well-resourced. Where do you most want to direct that today?",
          title: 'Morning Direction'
        };
      }
      return {
        prompt: "You're at your best. What does making the most of today actually look like – specifically?",
        title: 'Morning Precision'
      };
    }
    // Strong/peak with low/medium pressure and no favourite: EXCLUDE coach
    return null;
  }

  // Afternoon coach decision tree
  if (timeOfDay === 'afternoon') {
    if (tier === 'depleted') {
      return {
        prompt: "You're running low. What's one thing you can let go of to make it through the afternoon?",
        title: 'Afternoon Reset'
      };
    }
    if (calendarPressure === 'high' && hasPreEventWithin4h) {
      return {
        prompt: "You have a high-stakes moment coming up this afternoon. What outcome would make this a success for you?",
        title: 'Afternoon Prep'
      };
    }
    // All other cases: EXCLUDE coach
    return null;
  }

  return null;
}

// ==================== PHASE 2: WEARABLE RECOVERY DAY (flagged OFF) ====================
const ENABLE_WEARABLE_RECOVERY_TRIGGER = false;

async function checkMasteryPlanRecoveryTrigger(
  userId: string,
  supabaseClient: any
): Promise<{ triggered: boolean; reason: string; hrvDeviation: number; consecutiveDays: number } | null> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentHRV } = await supabaseClient
      .from('wearable_data')
      .select('summary_date, hrv')
      .eq('user_id', userId)
      .gte('summary_date', sevenDaysAgo.toISOString().split('T')[0])
      .order('summary_date', { ascending: false })
      .limit(7);

    if (!recentHRV || recentHRV.length < 3) return null;

    const baseline = recentHRV.reduce((sum: number, d: any) => sum + (d.hrv || 0), 0) / recentHRV.length;
    if (baseline <= 0) return null;

    let consecutiveDays = 0;
    for (const sample of recentHRV) {
      const deviation = ((sample.hrv - baseline) / baseline) * 100;
      if (deviation < -20) consecutiveDays++;
      else break;
    }

    if (consecutiveDays >= 2) {
      const todayDeviation = Math.round(((recentHRV[0].hrv - baseline) / baseline) * 100);
      return { triggered: true, reason: `Sustained HRV deficit (${consecutiveDays} days <-20%)`, hrvDeviation: todayDeviation, consecutiveDays };
    }

    const todayDeviation = ((recentHRV[0].hrv - baseline) / baseline) * 100;
    if (todayDeviation < -30) {
      return { triggered: true, reason: 'Severe HRV drop (<-30%)', hrvDeviation: Math.round(todayDeviation), consecutiveDays: 1 };
    }

    return null;
  } catch { return null; }
}

// ==================== SHARED CONTEXT ====================

interface SharedContext {
  rawCalendarEvents: any[];
  calendarGaps: number[];
  innerReadinessPattern: { trend: 'improving' | 'declining' | 'stable'; values: number[] };
  causeEffect: {
    practiceImpact: { practiceId: string; avgOutcomeShift: number; count: number }[];
    stateCarryover: { eveningTier: string; morningTier: string; count: number }[];
  };
  pendingCommitments: any[];
  combinedAlreadyUsed: string[];
  // Brief↔Plan parity — canonical shared-module output the Brief reasoned
  // over. Loaded from `brief_snapshots.payload_json.behaviour_snapshot` (or
  // the inline `outerReadinessCache.behaviourSnapshot` when the same caller
  // generated the Brief moments earlier). When null, the Plan re-derives a
  // snapshot locally via buildBehaviourSnapshot so it still gets the shared
  // rule output — this fallback is logged so drift is visible.
  briefBehaviour: PersistedBriefBehaviourSnapshot | null;
  briefBehaviourSource: 'brief_snapshot' | 'outer_readiness_cache' | 'local_fallback' | 'absent';
  // Soft memory for the active local week, written by list-week-ahead-priorities
  // on Sunday (and on manual Week-Ahead opens). Read-only here — used as
  // context only, never to hard-override selectors. Null when the user has
  // not opened the Week-Ahead surface this week.
  weeklyPlanSnapshot: {
    weekStartDate: string;
    weekEndDate: string;
    source: string;
    priorities: any[];
    selectedPlan: any | null;
    userEdits: any | null;
  } | null;
}

// ═════════════════════════════════════════════════════════════════════
// Sprint D — Plan practice window signals.
//
// Coarse morning/afternoon/evening physiology + state signals derived
// entirely from data already assembled on `req`. No new DB queries, no
// new derivation paths. Only ever used as *additive* scoring bias inside
// `selectPracticeForSlot` (see practice-selector.ts::windowSignalBoost).
// Missing / unknown signals stay null → no-op on selection.
// ═════════════════════════════════════════════════════════════════════
export function derivePlanWindowSignals(
  req: PlanRequest,
  timeOfDay: 'morning' | 'afternoon' | 'evening',
): {
  sleepQuality: 'poor' | 'fair' | 'good' | 'peak' | null;
  hrvDeviationPct: number | null;
  currentHrVsRestingPct: number | null;
  bodyLoadElevated: boolean;
  decisionLeakageRisk: boolean;
  recoveryNote: 'rest' | 'light' | 'normal' | null;
} | null {
  const w = req.wearableContext;
  const hasWearable = !!w?.hasData;

  // sleepQuality — trust explicit label if provided, else derive from score.
  let sleepQuality: 'poor' | 'fair' | 'good' | 'peak' | null = null;
  if (hasWearable) {
    const label = (w?.sleepQuality || '').toLowerCase();
    if (label === 'poor' || label === 'fair' || label === 'good' || label === 'peak') {
      sleepQuality = label as any;
    } else if (typeof w?.sleepScore === 'number') {
      if (w.sleepScore < 60) sleepQuality = 'poor';
      else if (w.sleepScore < 75) sleepQuality = 'fair';
      else if (w.sleepScore < 85) sleepQuality = 'good';
      else sleepQuality = 'peak';
    }
  }

  const hrvDeviationPct = hasWearable && typeof w?.hrvDeviation === 'number' ? w.hrvDeviation : null;

  // currentHrVsRestingPct — not currently computed in this function's
  // wearable context; compute-outer-readiness owns that derivation. Leave
  // null rather than invent a new reader. (Documented Sprint D gap.)
  const currentHrVsRestingPct: number | null = null;

  // Evening body load — proxy off sustained HRV depression.
  const bodyLoadElevated =
    timeOfDay === 'evening' && typeof hrvDeviationPct === 'number' && hrvDeviationPct <= -10;

  // Decision leakage risk — afternoon/evening only, and only when the
  // check-in itself signals low clarity. Never invented from calendar.
  const clarity = typeof req.clarityLevel === 'number' ? req.clarityLevel : null;
  const decisionLeakageRisk =
    (timeOfDay === 'afternoon' || timeOfDay === 'evening') &&
    clarity !== null &&
    clarity > 0 &&
    clarity <= 2;

  // Recovery note — evening only, conservative 'rest' signal when the
  // body clearly needs it. Otherwise null (no fabricated light/normal).
  let recoveryNote: 'rest' | 'light' | 'normal' | null = null;
  if (timeOfDay === 'evening' && hasWearable) {
    const deepDeficit = typeof hrvDeviationPct === 'number' && hrvDeviationPct <= -15;
    const lowSleep = typeof w?.sleepScore === 'number' && w.sleepScore < 55;
    if (deepDeficit || lowSleep) recoveryNote = 'rest';
  }

  // If literally nothing usable, return null so the selector short-circuits.
  const anyPresent =
    sleepQuality !== null ||
    hrvDeviationPct !== null ||
    currentHrVsRestingPct !== null ||
    bodyLoadElevated ||
    decisionLeakageRisk ||
    recoveryNote !== null;
  if (!anyPresent) return null;

  return {
    sleepQuality,
    hrvDeviationPct,
    currentHrVsRestingPct,
    bodyLoadElevated,
    decisionLeakageRisk,
    recoveryNote,
  };
}

async function buildSharedContext(req: PlanRequest, supabaseClient: any, outerReadinessCache?: any): Promise<SharedContext> {
  // F1 — prefer the caller-supplied window (Executive Home orchestrator);
  // fall back to wall-clock only for legacy callers with no explicit window.
  const timeOfDay = (req.timeWindow ?? getTimeOfDay(req.timezoneOffset)) as
    'morning' | 'afternoon' | 'evening';
  const today = getLocalDateISO(req.timezoneOffset);
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const ctx: SharedContext = {
    rawCalendarEvents: [],
    calendarGaps: [],
    innerReadinessPattern: { trend: 'stable', values: [] },
    causeEffect: { practiceImpact: [], stateCarryover: [] },
    pendingCommitments: [],
    combinedAlreadyUsed: [],
    briefBehaviour: null,
    briefBehaviourSource: 'absent',
    weeklyPlanSnapshot: null,
  };

  // ═══ PARALLEL BATCH: All server-side data fetching consolidated ═══
  const [
    calConnRes, checkinsRes, wearableRes, profileRes,
    favsRes, ritualRes, feedbackRes, insightsRes, commitmentsRes,
    practiceSessionsRes,
  ] = await Promise.all([
    supabaseClient.from('calendar_connections').select('is_active').eq('user_id', req.userId).eq('is_active', true).limit(1).maybeSingle(),
    supabaseClient.from('daily_checkins').select('outcome, clarity_level, confidence_level, energy_balance, checkin_date, time_window').eq('user_id', req.userId).order('checkin_date', { ascending: false }).order('timestamp', { ascending: false }).limit(10),
    supabaseClient.from('wearable_data').select('sleep_score, hrv, resting_heart_rate, sleep_quality, summary_date').eq('user_id', req.userId).gte('summary_date', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]).order('summary_date', { ascending: false }).limit(1).maybeSingle(),
    supabaseClient.from('profiles').select('practice_priority_tag, pressure_context_tag, user_archetype, component_scores').eq('id', req.userId).maybeSingle(),
    supabaseClient.from('user_favorites').select('content_id').eq('user_id', req.userId),
    supabaseClient.from('daily_ritual_completions').select('completed_practice_ids').eq('user_id', req.userId).eq('ritual_date', today).eq('session_period', timeOfDay).maybeSingle(),
    supabaseClient.from('content_relevance_feedback').select('content_id').eq('user_id', req.userId).gte('star_rating', 4),
    supabaseClient.from('user_coach_insights').select('id, insight_type, insight_content, content_reference, confidence_score').eq('user_id', req.userId).eq('is_active', true).gte('confidence_score', 0.6).order('extracted_at', { ascending: false }).limit(50),
    supabaseClient.from('coach_accountability_tracker').select('commitment_text, target_practice_id, pattern_area, status').eq('user_id', req.userId).eq('status', 'pending'),
    supabaseClient.from('practice_sessions').select('content_id, completed_at').eq('user_id', req.userId).gte('completed_at', new Date(Date.now() - 14 * 86400000).toISOString()).order('completed_at', { ascending: false }).limit(100),
  ]);

  // ── Calendar events ──
  if (calConnRes.data) {
    req.hasCalendarConnection = true;
    const { data: events } = await supabaseClient
      .from('primary_calendar_events')
      .select('id, title, start_time, end_time, is_organizer, attendees_count, is_recurring, event_metadata')
      .eq('user_id', req.userId)
      .gte('start_time', now.toISOString())
      .lte('start_time', in48h.toISOString())
      .order('start_time', { ascending: true });
    const mergedEvents = mergeCalendarEvents((events || []) as any[], 'unknown');
    logMergeStats('plan.upcoming-48h', (events || []).length, mergedEvents as any, { userId: req.userId });
    const selectedIds = new Set((req.selectedCalendarEventIds || []).filter(Boolean));
    const prioritizedEvents = [...mergedEvents].sort((a: any, b: any) => {
      const aSelected = selectedIds.has(a.id) ? 1 : 0;
      const bSelected = selectedIds.has(b.id) ? 1 : 0;
      if (aSelected !== bSelected) return bSelected - aSelected;
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });
    ctx.rawCalendarEvents = prioritizedEvents;
    req.calendarEvents = ctx.rawCalendarEvents.map((e: any) => ({
      id: e.id, title: e.title, startTime: e.start_time, endTime: e.end_time,
      isOrganizer: e.is_organizer, attendeesCount: e.attendees_count, isRecurring: e.is_recurring,
      eventMetadata: e.event_metadata || null,
    }));
    console.log(`[buildSharedContext] calendar_events: ${ctx.rawCalendarEvents.length} events in next 48h`);
  } else {
    req.hasCalendarConnection = false;
    req.calendarEvents = [];
  }

  // ── Calendar load/pressure + gaps ──
  {
    const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    const upcoming = ctx.rawCalendarEvents.filter((e: any) => new Date(e.start_time) >= now && new Date(e.start_time) <= fourHoursLater);
    req.calendarLoad = upcoming.length >= 5 ? 'high' : upcoming.length >= 3 ? 'medium' : 'low';
    let totalPressure = 0;
    upcoming.forEach((e: any) => {
      let ep = 0;
      if (e.is_organizer) ep += 2;
      const att = e.attendees_count || 0;
      if (att > 5) ep += 2; else if (att > 2) ep += 1;
      const dur = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 60000;
      if (dur > 60) ep += 2; else if (dur >= 30) ep += 1;
      if (!e.is_recurring) ep += 1;
      const hour = new Date(e.start_time).getHours();
      if ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 16)) ep += 1;
      totalPressure += ep;
    });
    const sorted = [...upcoming].sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = (new Date(sorted[i + 1].start_time).getTime() - new Date(sorted[i].end_time).getTime()) / 60000;
      if (gap < 15) totalPressure += 1;
    }
    req.calendarPressure = totalPressure >= 6 ? 'high' : totalPressure >= 3 ? 'medium' : 'low';

    // Calendar gaps between consecutive future events
    const futureEvents = ctx.rawCalendarEvents
      .filter((e: any) => new Date(e.start_time) >= now)
      .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    for (let i = 0; i < futureEvents.length - 1; i++) {
      ctx.calendarGaps.push(Math.round((new Date(futureEvents[i + 1].start_time).getTime() - new Date(futureEvents[i].end_time).getTime()) / 60000));
    }
  }

  // ── Check-in data ──
  const checkins = checkinsRes.data || [];
  if (checkins.length > 0) {
    const windowCheckin = checkins.find((c: any) => c.checkin_date === today && c.time_window === timeOfDay);
    const latest = windowCheckin || checkins[0];
    req.clarityLevel = latest.clarity_level ?? 0;
    req.confidenceLevel = latest.confidence_level ?? 0;
    req.checkInOutcome = latest.outcome || 'steady';
    const eb = latest.energy_balance ?? 50;
    req.innerReadinessScore = eb;
    if (eb < 40) req.innerReadinessTier = 'depleted';
    else if (eb < 60) req.innerReadinessTier = 'managing';
    else if (eb < 75) req.innerReadinessTier = 'strong';
    else req.innerReadinessTier = 'peak';

    // Consecutive-low pattern
    const first = checkins[0].outcome;
    const lowStates = ['overwhelmed', 'drained', 'scattered'];
    if (lowStates.includes(first)) {
      let count = 1;
      for (let i = 1; i < checkins.length; i++) { if (checkins[i].outcome === first) count++; else break; }
      if (count >= 3) req.patternInsight = { count, state: first };
    }

    // innerReadinessPattern.trend (last 5 energy_balance direction)
    const last5 = checkins.slice(0, 5).map((c: any) => c.energy_balance ?? 50);
    ctx.innerReadinessPattern.values = last5;
    if (last5.length >= 3) {
      const older = last5.slice(Math.floor(last5.length / 2));
      const recent = last5.slice(0, Math.floor(last5.length / 2));
      const avgOlder = older.reduce((s: number, v: number) => s + v, 0) / older.length;
      const avgRecent = recent.reduce((s: number, v: number) => s + v, 0) / recent.length;
      const diff = avgRecent - avgOlder;
      ctx.innerReadinessPattern.trend = diff > 5 ? 'improving' : diff < -5 ? 'declining' : 'stable';
    }

    // causeEffect.stateCarryover (evening→morning)
    try {
      const byDate: Record<string, any[]> = {};
      for (const c of checkins) { if (!byDate[c.checkin_date]) byDate[c.checkin_date] = []; byDate[c.checkin_date].push(c); }
      const dates = Object.keys(byDate).sort().reverse();
      const getTier = (eb: number) => eb < 40 ? 'depleted' : eb < 60 ? 'managing' : eb < 75 ? 'strong' : 'peak';
      const pairMap: Record<string, { eveningTier: string; morningTier: string; count: number }> = {};
      for (let i = 0; i < dates.length - 1; i++) {
        const prevEvenings = byDate[dates[i + 1]]?.filter((c: any) => c.time_window === 'evening') || [];
        const mornings = byDate[dates[i]]?.filter((c: any) => c.time_window === 'morning') || [];
        if (prevEvenings.length > 0 && mornings.length > 0) {
          const evT = getTier(prevEvenings[0].energy_balance ?? 50);
          const moT = getTier(mornings[0].energy_balance ?? 50);
          const key = `${evT}→${moT}`;
          if (!pairMap[key]) pairMap[key] = { eveningTier: evT, morningTier: moT, count: 0 };
          pairMap[key].count++;
        }
      }
      ctx.causeEffect.stateCarryover = Object.values(pairMap).filter(c => c.count >= 2);
    } catch { /* ignore */ }
  }

  // ── Wearable data ──
  if (wearableRes.data) {
    const w = wearableRes.data;
    let hrvDeviation: number | null = null;
    if (w.hrv != null) {
      const { data: baselineRows } = await supabaseClient.from('wearable_data').select('hrv').eq('user_id', req.userId).not('hrv', 'is', null).order('summary_date', { ascending: false }).limit(30);
      if (baselineRows && baselineRows.length >= 5) {
        const avgHRV = baselineRows.reduce((sum: number, r: any) => sum + Number(r.hrv), 0) / baselineRows.length;
        if (avgHRV > 0) hrvDeviation = ((Number(w.hrv) - avgHRV) / avgHRV) * 100;
      }
    }
    req.wearableContext = { sleepScore: w.sleep_score ?? null, hrvMs: w.hrv != null ? Number(w.hrv) : null, restingHR: w.resting_heart_rate ?? null, hrvDeviation, sleepQuality: w.sleep_quality ?? null, hasData: true };
    console.log(`[buildSharedContext] wearable: sleep=${w.sleep_score}, hrv=${w.hrv}, hrvDev=${hrvDeviation?.toFixed(1)}%`);
  }

  // ── Profile tags + component scores ──
  if (profileRes.data) {
    req.practicePriorityTag = profileRes.data.practice_priority_tag || '';
    req.pressureContextTag = profileRes.data.pressure_context_tag || '';
    req.archetype = (profileRes.data as any).user_archetype || '';
    req.componentScores = profileRes.data.component_scores || null;
  }

  // ── Engagement signals ──
  req.effectiveContent = (feedbackRes.data || []).map((f: any) => f.content_id);
  req.coachInsights = (insightsRes.data || []).map((r: any) => ({ id: r.id, type: r.insight_type, content: r.insight_content, contentReference: r.content_reference || undefined, confidence: r.confidence_score || 0.5 }));
  // ── Day-scoped completion union (Stateful Plan Evolution) ──
  // Rather than reading only the current period's row, union all today's
  // periods so morning completions survive into afternoon brief regenerations.
  // This is the canonical "what has the user finished today" set used to:
  //   (a) freeze sticky completed slots in mergeWithLedger
  //   (b) prevent already-done content from resurfacing as new picks
  try {
    const { data: todayCompletionRows } = await supabaseClient
      .from('daily_ritual_completions')
      .select('completed_practice_ids, session_period')
      .eq('user_id', req.userId)
      .eq('ritual_date', today);
    const union = new Set<string>();
    for (const row of (todayCompletionRows || [])) {
      for (const id of (row?.completed_practice_ids || [])) union.add(id);
    }
    req.completedToday = Array.from(union);
  } catch {
    req.completedToday = ritualRes.data?.completed_practice_ids || [];
  }
  req.favorites = (favsRes.data || []).map((f: any) => f.content_id);
  ctx.pendingCommitments = commitmentsRes.data || [];

  // causeEffect.practiceImpact (practice_sessions × daily_checkins)
  try {
    const sessions = practiceSessionsRes.data || [];
    // Phase L — recency map for selectPracticesByCombo / filler scoring.
    // contentId → integer days-ago of most-recent completion (0 = today).
    // Read from the same 14-day practice_sessions query; no extra DB call.
    const todayUtcMs = Date.now();
    const recentDays: Record<string, number> = {};
    for (const s of sessions) {
      const pid = s?.content_id;
      const ts = s?.completed_at ? new Date(s.completed_at).getTime() : NaN;
      if (!pid || !Number.isFinite(ts)) continue;
      const days = Math.max(0, Math.floor((todayUtcMs - ts) / 86_400_000));
      if (!(pid in recentDays) || days < recentDays[pid]) recentDays[pid] = days;
    }
    (req as any).recentPracticeDays = recentDays;
    if (sessions.length > 0 && checkins.length > 0) {
      const impactMap: Record<string, { totalShift: number; count: number }> = {};
      for (const session of sessions) {
        const sessionDate = (session.completed_at || '').split('T')[0];
        const sameDay = checkins.filter((c: any) => c.checkin_date === sessionDate);
        if (sameDay.length >= 2) {
          const pre = sameDay[sameDay.length - 1].energy_balance ?? 50;
          const post = sameDay[0].energy_balance ?? 50;
          const pid = session.content_id;
          if (!impactMap[pid]) impactMap[pid] = { totalShift: 0, count: 0 };
          impactMap[pid].totalShift += (post - pre);
          impactMap[pid].count++;
        }
      }
      ctx.causeEffect.practiceImpact = Object.entries(impactMap)
        .filter(([_, v]) => v.count >= 2)
        .map(([pid, v]) => ({ practiceId: pid, avgOutcomeShift: Math.round(v.totalShift / v.count), count: v.count }));
    }
  } catch { /* ignore */ }

  // ── Outer Readiness (use client cache if provided, else server-to-server) ──
  if (outerReadinessCache && outerReadinessCache.phrase) {
    console.log('[generate-mastery-plan] Using cached outer readiness');
    req.outerReadinessPhrase = outerReadinessCache.phrase || 'Steady execution.';
    req.outerReadinessDriver = outerReadinessCache.driver || 'state';
    req.outerReadinessContext = outerReadinessCache.context || outerReadinessCache.contextStatement || '';
    req.outerReadinessLeanOn = outerReadinessCache.leanOn || '';
    req.outerReadinessWatchFor = outerReadinessCache.watchFor || '';
  } else {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      const outerRes = await fetch(`${supabaseUrl}/functions/v1/compute-outer-readiness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({
          userId: req.userId, timezoneOffset: req.timezoneOffset,
          innerReadinessTier: req.innerReadinessTier, innerReadinessScore: req.innerReadinessScore,
          clarityLevel: req.clarityLevel, confidenceLevel: req.confidenceLevel, checkInOutcome: req.checkInOutcome,
          componentScores: req.componentScores || null,
          practicePriorityTag: req.practicePriorityTag || null,
        }),
      });
      if (outerRes.ok) {
        const outerData = await outerRes.json();
        req.outerReadinessPhrase = outerData.phrase || 'Steady execution.';
        req.outerReadinessDriver = outerData.driver || 'state';
        req.outerReadinessContext = outerData.context || '';
        req.outerReadinessLeanOn = outerData.leanOn || '';
        req.outerReadinessWatchFor = outerData.watchFor || '';
        ctx.combinedAlreadyUsed = [...(outerData.stateAlreadyUsed || []), ...(outerData.compassAlreadyUsed || [])];
      }
    } catch {
      req.outerReadinessPhrase = 'Steady execution.';
      req.outerReadinessDriver = 'state';
      req.outerReadinessContext = '';
      req.outerReadinessLeanOn = '';
      req.outerReadinessWatchFor = '';
    }
  }

  console.log(`[buildSharedContext] Complete: tier=${req.innerReadinessTier} score=${req.innerReadinessScore} trend=${ctx.innerReadinessPattern.trend} calLoad=${req.calendarLoad} gaps=${ctx.calendarGaps.length} practiceImpact=${ctx.causeEffect.practiceImpact.length} stateCarryover=${ctx.causeEffect.stateCarryover.length}`);

  // ── Week Ahead snapshot (soft memory, current local week only) ──
  // Read the user's current Mon→Sun snapshot if present. Used as advisory
  // context only — never to hard-override event selection, slot allocation,
  // practice selection, signal pills, or awaiting-signals envelope.
  try {
    const tzOff = req.timezoneOffset ?? 0;
    const localNow = new Date(Date.now() - tzOff * 60000);
    const dow = localNow.getDay();
    const daysFromMonday = (dow + 6) % 7;
    const localMonday = new Date(localNow);
    localMonday.setHours(0, 0, 0, 0);
    localMonday.setDate(localMonday.getDate() - daysFromMonday);
    const weekStart = `${localMonday.getFullYear()}-${String(localMonday.getMonth() + 1).padStart(2, '0')}-${String(localMonday.getDate()).padStart(2, '0')}`;

    const { data: snapRow } = await supabaseClient
      .from('weekly_plan_snapshots')
      .select('week_start_date, week_end_date, source, priorities, selected_plan, user_edits')
      .eq('user_id', req.userId)
      .eq('week_start_date', weekStart)
      .eq('source', 'sunday_week_ahead')
      .maybeSingle();

    if (snapRow && snapRow.week_start_date === weekStart) {
      ctx.weeklyPlanSnapshot = {
        weekStartDate: snapRow.week_start_date,
        weekEndDate: snapRow.week_end_date,
        source: snapRow.source,
        priorities: Array.isArray(snapRow.priorities) ? snapRow.priorities : [],
        selectedPlan: snapRow.selected_plan ?? null,
        userEdits: snapRow.user_edits ?? null,
      };
      console.log('[week_ahead.read.hit]', { userId: redactUserId(req.userId), weekStart, priorities: ctx.weeklyPlanSnapshot.priorities.length });
    } else {
      ctx.weeklyPlanSnapshot = null;
      console.log('[week_ahead.read.miss]', { userId: redactUserId(req.userId), weekStart });
    }
  } catch (e) {
    console.warn('[week_ahead.read.error]', (e as Error).message);
    ctx.weeklyPlanSnapshot = null;
  }

  // ── Brief behaviour snapshot (Brief↔Plan parity, canonical) ──
  // Priority order:
  //   1. outerReadinessCache.behaviourSnapshot (inline from same-request brief)
  //   2. brief_snapshots.payload_json.behaviour_snapshot (latest row for this
  //      user/local_date/time_window)
  //   3. local fallback via buildBehaviourSnapshot — only when the Brief has
  //      not been written yet for the current window. Logged so drift is
  //      visible in production.
  try {
    const inlineSnap = (outerReadinessCache as any)?.behaviourSnapshot ?? null;
    if (inlineSnap && Array.isArray(inlineSnap.flagsPlan)) {
      ctx.briefBehaviour = inlineSnap as PersistedBriefBehaviourSnapshot;
      ctx.briefBehaviourSource = 'outer_readiness_cache';
    } else {
      const localDateForLookup = req.localDate || today;
      // Disambiguate the load with the same prompt-version the Brief writes
      // under so a stale prior-version row in the same window cannot win the
      // "latest" ordering. If the same-request `outerReadinessCache` exposed a
      // signatureHash (it does even when the inline snapshot was unusable),
      // require the loaded row to match it — otherwise the snapshot is stale
      // and we fall through to the local rebuild rather than silently using
      // wrong CEO behaviour flags.
      const expectedSig =
        typeof (outerReadinessCache as any)?.behaviourSnapshot?.signatureHash === 'string'
          ? (outerReadinessCache as any).behaviourSnapshot.signatureHash
          : undefined;
      const loaded = await loadBriefBehaviourSnapshot(
        supabaseClient,
        req.userId,
        localDateForLookup,
        timeOfDay,
        { promptVersion: BRIEF_PROMPT_VERSION, expectedSignatureHash: expectedSig },
      );
      if (loaded) {
        ctx.briefBehaviour = loaded;
        ctx.briefBehaviourSource = 'brief_snapshot';
      } else {
        // F2 — strict Brief↔Plan handshake for Executive Home snapshot
        // path. When the caller (`build-executive-home-cards`) demands
        // exact same-window Brief parity, refuse to silently rebuild
        // behaviour flags locally — the Plan returns an awaiting envelope
        // upstream instead. `briefBehaviourSource` stays `'absent'` so
        // callers can see the handshake failed.
        if (req.strictBriefHandshake === true) {
          console.warn(
            `[buildSharedContext] strict Brief handshake failed user=${req.userId} date=${localDateForLookup} window=${timeOfDay} promptVersion=${BRIEF_PROMPT_VERSION} expectedSig=${expectedSig ?? 'none'} — skipping local rebuild`,
          );
          ctx.briefBehaviour = null;
          ctx.briefBehaviourSource = 'absent';
        } else {
        // Logged for visibility — every fallback here is a drift risk.
        console.warn(
          `[buildSharedContext] briefBehaviour fallback to local rebuild user=${req.userId} date=${localDateForLookup} window=${timeOfDay} promptVersion=${BRIEF_PROMPT_VERSION} expectedSig=${expectedSig ?? 'none'}`,
        );
        // Last-resort local rebuild. Same shared module the Brief uses, so
        // the rules / taxonomy / slot boosts stay canonical even when no
        // Brief row exists yet for this window.
        const w = req.wearableContext;
        const wearableForCtx = w?.hasData
          ? {
              hrvDeviationPct: w.hrvDeviation ?? null,
              sleepHours: null as number | null,
              sleepDeviationPct: null as number | null,
              rhrDeviationPct: null as number | null,
            }
          : null;
        const planEvents = (req.calendarEvents || [])
          .filter((e: any) => e?.title && e?.startTime)
          .map((e: any) => ({
            title: e.title as string,
            startTime: e.startTime as string,
            endTime: e.endTime ?? null,
            stakesLevel: null as string | null,
          }));
        // Split today / tomorrow in the user's local calendar, not the
        // server's timezone, so pre-flight travel parity matches the Brief.
        const _fbOffsetMin = (req.timezoneOffset ?? 0) | 0;
        const _fbTodayLocalMs = Date.parse(`${localDateForLookup}T00:00:00.000Z`);
        const _fbStartTomorrowMs = _fbTodayLocalMs + 24 * 60 * 60 * 1000 + _fbOffsetMin * 60_000;
        const _fbEndTomorrowMs = _fbStartTomorrowMs + 24 * 60 * 60 * 1000;
        const _planEventsToday = planEvents.filter((e) => {
          const t = new Date(e.startTime).getTime();
          return t < _fbStartTomorrowMs;
        });
        const _planEventsTomorrow = planEvents.filter((e) => {
          const t = new Date(e.startTime).getTime();
          return t >= _fbStartTomorrowMs && t < _fbEndTomorrowMs;
        });
        const _fbCurrentTz = (req as any).effectiveCurrentTimezone ?? (req as any).currentTimezone ?? null;
        const _fbHomeTz = (req as any).effectiveHomeTimezone ?? (req as any).homeTimezone ?? null;
        // Part 1 — hydrate travel_state for the fail-open fallback rebuild.
        // Sprint 10: apply the shared travel freshness guard so a stale row
        // (`updated_at` bumped by sync skip only) can't masquerade as real
        // travel evidence.
        let _fbTravelState:
          | { state?: string | null; distanceFromHomeKm?: number | null }
          | null = null;
        try {
          const { data: tsRow } = await (supabaseClient as any)
            .from('travel_state')
            .select('state, distance_from_home_km, last_state_change_at, last_location_at')
            .eq('user_id', req.userId)
            .maybeSingle();
          const freshness = decideTravelFreshness({
            state: (tsRow as any)?.state ?? null,
            lastStateChangeAt: (tsRow as any)?.last_state_change_at ?? null,
            lastLocationAt: (tsRow as any)?.last_location_at ?? null,
            now,
          });
          console.log('[travel-state][consumer]', {
            fn: 'generate-mastery-plan',
            used: freshness.used,
            reason: freshness.reason,
            hasRow: !!tsRow,
            state: (tsRow as any)?.state ?? null,
          });
          if (tsRow && freshness.used) {
            _fbTravelState = {
              state: (tsRow as any).state ?? null,
              distanceFromHomeKm: (tsRow as any).distance_from_home_km ?? null,
            };
          }
        } catch (tsErr) {
          console.warn('[generate-mastery-plan] travel_state hydration skipped:',
            tsErr instanceof Error ? tsErr.message : tsErr);
        }
        const fallback = buildBehaviourSnapshot({
          coverage: {
            wearable: wearableForCtx,
            checkIn: {
              emotionalSelfDeclared: req.checkInOutcome ?? null,
              mentalSharpness: null,
              confidence: req.confidenceLevel ?? null,
              clarity: req.clarityLevel ?? null,
            },
            scoreToday: req.innerReadinessScore ?? null,
            scoreYesterday: null,
            trailingClarityAvg: null,
            timezone: {
              offsetMinutes: -((req.timezoneOffset ?? 0) | 0),
              shift48hHours: null,
              travelDay: !!(_fbCurrentTz && _fbHomeTz && _fbCurrentTz !== _fbHomeTz),
            },
            travelState: _fbTravelState,
            events: _planEventsToday,
            tomorrowEvents: _planEventsTomorrow,
            now,
          },
          extras: { dayOfWeek: now.getDay() },
        });
        ctx.briefBehaviour = {
          signatureHash: fallback.signatureHash,
          flagsBrief: fallback.flagsBrief,
          flagsPlan: fallback.flagsPlan,
          slotBoosts: fallback.slotBoosts,
          taxonomyBlock: fallback.taxonomyBlock,
          promptBlockBrief: fallback.promptBlockBrief,
          promptBlockPlan: fallback.promptBlockPlan,
        };
        ctx.briefBehaviourSource = 'local_fallback';
        }
      }
    }
    console.log(
      `[buildSharedContext] briefBehaviour source=${ctx.briefBehaviourSource} sig=${ctx.briefBehaviour?.signatureHash ?? 'none'} flagsBrief=${ctx.briefBehaviour?.flagsBrief.length ?? 0} flagsPlan=${ctx.briefBehaviour?.flagsPlan.length ?? 0} boosts=${ctx.briefBehaviour?.slotBoosts.length ?? 0} anchors=${briefAnchorEventTitles(ctx.briefBehaviour).join('|') || 'none'}`,
    );
  } catch (e) {
    console.warn('[buildSharedContext] briefBehaviour load failed:', (e as any)?.message || e);
  }

  return ctx;
}

// ==================== MAIN PLAN GENERATION ====================

async function generateMasteryPlan(req: PlanRequest, supabaseClient: any, outerReadinessCache?: any) {
  // F1 — same window resolution as buildSharedContext.
  const timeOfDay = (req.timeWindow ?? getTimeOfDay(req.timezoneOffset)) as
    'morning' | 'afternoon' | 'evening';

  // Phase 2: Recovery day override (feature-flagged OFF)
  if (ENABLE_WEARABLE_RECOVERY_TRIGGER) {
    const recoveryTrigger = await checkMasteryPlanRecoveryTrigger(req.userId, supabaseClient);
    if (recoveryTrigger?.triggered) {
      console.log(`[generate-mastery-plan] RECOVERY DAY TRIGGERED: ${recoveryTrigger.reason}`);
    }
  }

  // ═══ BUILD SHARED CONTEXT – single consolidated function ═══
  const shared = await buildSharedContext(req, supabaseClient, outerReadinessCache);
  const rawCalendarEvents = shared.rawCalendarEvents;
  const combinedAlreadyUsed = shared.combinedAlreadyUsed;
  const pendingCommitments = shared.pendingCommitments;

  // F2 — Strict Brief handshake: if the caller requires exact same-window
  // Brief snapshot parity and the loader returned nothing, short-circuit
  // with an awaiting envelope. This is deliberately narrower than the
  // signal-gate below: even if the user has stage-1 signals and an MRS,
  // a missing/stale Brief snapshot means the Plan would be reasoning over
  // a locally rebuilt behaviour surface, which the Executive Home snapshot
  // contract forbids.
  if (req.strictBriefHandshake === true && shared.briefBehaviourSource === 'absent') {
    const timeOfDayForAwaiting =
      (req.timeWindow ?? getTimeOfDay(req.timezoneOffset)) as
        'morning' | 'afternoon' | 'evening';
    console.warn('[generate-mastery-plan] strict-handshake awaiting envelope', {
      userId: req.userId,
      window: timeOfDayForAwaiting,
      reason: 'brief_behaviour_snapshot_missing_or_stale',
    });
    return {
      planState: 'awaiting_signals',
      awaitingSignals: true,
      reason: 'brief_handshake_missing',
      message: 'Waiting for the Brief to publish for this window.',
      horizonModules: [],
      calendarPills: [],
      preEventPlan: null,
      jitPriority: null,
      timeOfDayPlan: {
        label: '',
        period: timeOfDayForAwaiting,
        modules: [],
        totalDuration: 0,
        progressTracked: false,
      },
      meta: { generatedAt: new Date().toISOString(), promptVersion: BRIEF_PROMPT_VERSION },
    } as any;
  }

  // ── Awaiting-signals gate (mirrors compute-outer-readiness contract) ──
  // If the user has no fresh check-in today AND no fresh
  // wearable data today, suppress the time-of-day plan from generating
  // from defaults. This ensures parity with the Brief, which renders a
  // quiet "Begin with your check-in" prompt under the same condition.
  // JIT pre-event plans for known scheduled events still surface.
  const serverLocalDate = getLocalDateISO(req.timezoneOffset);
  const today = req.localDate || serverLocalDate;
  // Day-scoped check-in lookup: ANY non-skipped check-in for today
  // satisfies the signal contract — independent of time_window. We never
  // suppress plan generation on awaiting-signals here; the client owns the
  // visible gate. We still detect the latest check-in so downstream
  // diagnostics + cache fingerprinting reflect reality.
  let todayCheckinQuery = supabaseClient
    .from('daily_checkins')
    .select('id, checkin_date, time_window, timestamp, skipped')
    .eq('user_id', req.userId);

  if (req.todayCheckinId) {
    todayCheckinQuery = todayCheckinQuery.eq('id', req.todayCheckinId);
  } else {
    todayCheckinQuery = todayCheckinQuery
      .eq('checkin_date', today)
      .eq('skipped', false)
      .order('timestamp', { ascending: false })
      .limit(1);
  }

  const { data: todayCheckinRow, error: todayCheckinError } = await todayCheckinQuery.maybeSingle();
  if (todayCheckinError) {
    console.error('[generate-mastery-plan] Today check-in lookup failed:', todayCheckinError);
  }
  const hasTodayCheckIn = !!todayCheckinRow && todayCheckinRow.skipped !== true;
  const hasWearableData = !!(req.wearableContext?.hasData);
  const hasCalendarSignal = (req.calendarEvents?.length ?? 0) > 0;
  const hasCalendarConnected = req.hasCalendarConnection === true;
  const hasStage1Signal = hasWearableData || hasCalendarSignal || hasCalendarConnected;
  let snapshotMrsAwaiting: boolean | null = null;
  try {
    const { data: mrsSnap } = await supabaseClient
      .from('daily_context_snapshot')
      .select('readiness_state, readiness_score_baseline, readiness_score_refined')
      .eq('user_id', req.userId)
      .eq('local_date', today)
      .eq('mrs_window', timeOfDay)
      .maybeSingle();
    if (mrsSnap) {
      snapshotMrsAwaiting =
        mrsSnap.readiness_state === 'awaiting' ||
        (mrsSnap.readiness_score_baseline == null && mrsSnap.readiness_score_refined == null);
    }
  } catch (mrsGateErr) {
    console.warn('[generate-mastery-plan] MRS snapshot gate lookup failed:', (mrsGateErr as Error)?.message ?? mrsGateErr);
  }
  const requestMrsAwaiting =
    req.mrsReadinessState === 'awaiting' ||
    (req.mrsReadinessState != null && req.mrsReadinessScore == null) ||
    outerReadinessCache?.awaitingSignals === true ||
    outerReadinessCache?.briefMode === 'cold-start';
  const mrsCardsAwaiting = snapshotMrsAwaiting === true || requestMrsAwaiting;
  const readinessStage = hasStage1Signal && hasTodayCheckIn
    ? 'full'
    : hasStage1Signal
      ? 'early'
      : 'cold_start';
  // Sprint 8 / Phase 10 guardrail:
  // Stage-1 signal (wearable OR calendar event OR calendar-connected) is
  // NECESSARY but NOT SUFFICIENT to unlock the Plan. Calendar-only cannot
  // fabricate a Plan while MRS cards are still awaiting — the readiness
  // pillar must have produced at least a baseline score. Do not weaken
  // this gate to `hasStage1Signal` alone; that would ship three fake
  // priorities to Executive Home on calendar-only mornings.
  const canGeneratePlan = hasStage1Signal && !mrsCardsAwaiting;
  const finalDecision = canGeneratePlan ? 'generate' : 'awaiting-signals';
  console.log('[generate-mastery-plan] signal-gate', {
    authenticatedUserId: req.userId,
    clientLocalDate: req.localDate || null,
    serverLocalDate,
    resolvedToday: today,
    currentPeriod: timeOfDay,
    todayCheckinIdFromRequest: req.todayCheckinId || null,
    dbCheckinRow: todayCheckinRow ? {
      id: (todayCheckinRow as any).id,
      checkin_date: (todayCheckinRow as any).checkin_date,
      time_window: (todayCheckinRow as any).time_window,
      timestamp: (todayCheckinRow as any).timestamp,
      skipped: (todayCheckinRow as any).skipped,
    } : null,
    hasTodayCheckIn,
    hasWearableData,
    hasCalendarSignal,
    hasCalendarConnected,
    hasStage1Signal,
    mrsCardsAwaiting,
    snapshotMrsAwaiting,
    requestMrsState: req.mrsReadinessState ?? null,
    requestMrsScore: req.mrsReadinessScore ?? null,
    readinessStage,
    finalDecision,
  });
  // Awaiting-signals gate mirrors compute-outer-readiness: only a true
  // cold-start suppresses the Plan. Stage 1 (wearable/calendar) can build an
  // early plan; today's check-in refines it to Full Read.
  if (!canGeneratePlan) {
    const gatingReason = 'missing_readiness_context';
    console.log('[generate-mastery-plan] awaiting-signals envelope returned', { gatingReason });
    const { data: wearableIntegration } = await supabaseClient
      .from('user_integrations')
      .select('watch_connection_status, watch_sync_status, watch_last_sync_at, watch_last_sample_at')
      .eq('user_id', req.userId)
      .maybeSingle();
    const { data: calendarConnections } = await supabaseClient
      .from('calendar_connections')
      .select('provider, is_active, last_sync')
      .eq('user_id', req.userId);
    const appleCalendarConnection = (calendarConnections ?? []).find((conn: any) => conn.provider === 'apple') ?? null;
    const awaitingMessage = buildReadinessAwaitingMessage({
      awaitingSignals: outerReadinessCache?.awaitingSignals === true,
      briefMode: outerReadinessCache?.briefMode ?? null,
      hasCurrentPeriodSignal: outerReadinessCache?.hasCurrentPeriodSignal ?? null,
      hasWearable: hasWearableData,
      hasCalendar: hasCalendarSignal || hasCalendarConnected,
      calendarState: hasCalendarSignal
        ? 'active'
        : hasCalendarConnected
          ? 'connected_no_events'
          : 'not_connected',
      wearableStatus: wearableIntegration ? {
        connectionStatus: wearableIntegration.watch_connection_status ?? null,
        syncStatus: wearableIntegration.watch_sync_status ?? null,
        hasTodayData: hasWearableData,
        hasRecentData: false,
        hasHistoricalData: hasWearableData,
      } : null,
      integrationStatus: {
        wearable: wearableIntegration ? {
          connectionStatus: wearableIntegration.watch_connection_status ?? null,
          syncStatus: wearableIntegration.watch_sync_status ?? null,
          hasTodayData: hasWearableData,
          hasRecentData: false,
          hasHistoricalData: hasWearableData,
        } : null,
        calendar: appleCalendarConnection ? {
          connectionStatus: appleCalendarConnection.is_active ? 'connected' : 'permission_revoked',
          state: hasCalendarSignal ? 'active' : hasCalendarConnected ? 'connected_no_events' : 'not_connected',
          needsReconnect: !appleCalendarConnection.is_active,
          connected: !!appleCalendarConnection.is_active,
        } : null,
      },
    });
    return {
      planState: 'awaiting_signals',
      awaitingSignals: true,
      reason: gatingReason,
      message: awaitingMessage,
      horizonModules: [],
      calendarPills: [],
      preEventPlan: null,
      jitPriority: null,
      timeOfDayPlan: {
        label: '',
        period: timeOfDay,
        modules: [],
        totalDuration: 0,
        progressTracked: false,
      },
      meta: { generatedAt: new Date().toISOString(), promptVersion: BRIEF_PROMPT_VERSION },
    } as any;
  }

  // 2. Fetch content library from DB
  const { data: contentLibrary } = await supabaseClient
    .from('sanctuary_content')
    .select('id, title, content_type, category, tags, duration, sub_type, difficulty, protocol_type, thumbnail_url')
    .eq('is_active', true);

  // Also fetch structured tags from metadata
  const { data: contentMetadata } = await supabaseClient
    .from('sanctuary_content_metadata')
    .select('content_id, structured_tags, mastery_category, horizon, meta_skill, is_foundational, moment, state_signal, duration_band');

  // Merge metadata into content
  const metadataMap = new Map((contentMetadata || []).map((m: any) => [m.content_id, m]));
  const enrichedContent = (contentLibrary || []).map((c: any) => {
    const meta = metadataMap.get(c.id);
    return {
      ...c,
      structured_tags: (meta as any)?.structured_tags,
      structuredTags: (meta as any)?.structured_tags,
      mastery_category: (meta as any)?.mastery_category,
      horizonTags: (meta as any)?.horizon || [],
      metaSkillTags: (meta as any)?.meta_skill || [],
      isFoundational: (meta as any)?.is_foundational ?? false,
      momentTags: (meta as any)?.moment || [],
      stateSignalTags: (meta as any)?.state_signal || [],
      durationBand: (meta as any)?.duration_band || 'short',
    };
  });

  // 3. Fetch HRV × Calendar correlations (defensive – null on failure)
  let hrvCorrelations: HRVCorrelationMap | null = null;
  try {
    hrvCorrelations = await getHRVEventCorrelations(req.userId, supabaseClient);
  } catch (hrvError: any) {
    console.error('[generate-mastery-plan] HRV correlation failed, proceeding without:', hrvError?.message);
  }

  // Optional learning-loop boost from event_priority_memory (Week-Ahead
  // picker shares this helper). Gated by WEEK_AHEAD_MEMORY_BOOST so weekday
  // Plan stays byte-identical until we flip the flag in a follow-up.
  let priorityMemoryIndex: PriorityMemoryIndex | null = null;
  let derivedMemoryByKey = new Map<string, { net_importance: number; permanent_flag: boolean }>();
  const memoryBoostOn =
    (Deno.env.get('WEEK_AHEAD_MEMORY_BOOST') ?? 'false').toLowerCase() === 'true';
  if (memoryBoostOn) {
    try {
      priorityMemoryIndex = await loadPriorityMemoryForUser(supabaseClient, req.userId);
      const { data: derivedRows } = await supabaseClient
        .from('event_priority_derived')
        .select('event_category, event_type_key, net_importance, permanent_flag')
        .eq('user_id', req.userId);
      derivedMemoryByKey = new Map(
        (derivedRows ?? []).map((r: any) => [
          `${String(r?.event_category || '').toLowerCase()}::${String(r?.event_type_key || '').toLowerCase()}`,
          {
            net_importance: Number(r?.net_importance ?? 0),
            permanent_flag: Boolean(r?.permanent_flag),
          },
        ]),
      );
    } catch (memErr: any) {
      console.warn('[generate-mastery-plan] priority memory load skipped:', memErr?.message);
    }
  }
  const planDebugSignals = {
    resolvedBy: memoryBoostOn ? 'derived_memory' : 'raw_memory',
    sovereignFired: !!priorityMemoryIndex,
    relationshipLeads: !!priorityMemoryIndex,
    gateBypassed: false,
  };

  // 4. Score calendar events – bridge to new pipeline (jit_event_context) with legacy fallback
  const scoredEvents = await getPreScoredEvents(req.userId, req.calendarEvents || [], supabaseClient, hrvCorrelations, priorityMemoryIndex);

  // Suppresses event types skipped 3+ times in last 30 days.
  // TODO: Replace with query to jit_cancellation_memory:
  //   SELECT DISTINCT event_type FROM jit_cancellation_memory
  //   WHERE user_id = userId AND penalty_level >= 3
  //   AND cancelled_at > NOW() - INTERVAL '30d'
  const skippedTypes3Plus: string[] = [];

  // Filter out 3+ skipped types (defensive – degrades to unfiltered on error)
  let filteredEvents = scoredEvents;
  try {
    filteredEvents = scoredEvents.filter(e => !skippedTypes3Plus.includes(e.scenario?.id || 'general'));
  } catch (filterError: any) {
    console.error('[generate-mastery-plan] Event filter failed, using unfiltered events:', filterError?.message);
  }

  // Per-slot replacements are honored post-merge via slot-index anchoring
  // (see applySlotReplacementOverrides). We intentionally do NOT boost
  // scores here — a global boost would let a per-slot replacement bubble
  // up to slot 1 instead of staying in the slot the user clicked.
  // Legacy `selectedCalendarEventIds` is retained as a soft signal only
  // (mark events for downstream observability), with no score impact.
  const legacySelectedIds = new Set((req.selectedCalendarEventIds || []).filter(Boolean));
  const slotReplacementEventIds = new Set(
    Object.values(req.slotReplacements || {})
      .map((v: any) => (v && typeof v.eventId === 'string' ? v.eventId : ''))
      .filter(Boolean),
  );
  if (legacySelectedIds.size > 0 || slotReplacementEventIds.size > 0) {
    for (const evt of filteredEvents) {
      if (legacySelectedIds.has(evt.event.id) || slotReplacementEventIds.has(evt.event.id)) {
        (evt as any).selectedByUser = true;
      }
    }
  }

  // v5.1: hard 24h MVP ceiling on JIT eligibility — never surface JIT prep for events >24h away.
  filteredEvents = filteredEvents.filter(e => (e.minutesUntil ?? 0) <= MVP_JIT_HORIZON_MINUTES);

  // v5.1: strategic event scoring boosts (deterministic, additive)
  try {
    const growthArea = ((req.coachInsights || []).find((i: any) => i.type === 'growth_area')?.content || '').toLowerCase();
    const priorityTag = (req.practicePriorityTag || '').toLowerCase();
    for (const se of filteredEvents) {
      const title = (se.event?.title || '').toLowerCase();
      const evtType = (se.scenario?.id || '').toLowerCase();
      if (growthArea && (title.includes(growthArea) || evtType.includes(growthArea))) se.score = (se.score || 0) + 15;
      if (priorityTag && (title.includes(priorityTag.replace(/_/g, ' ')) || evtType.includes(priorityTag))) se.score = (se.score || 0) + 10;
      if (se.hrvCorrelation && Math.abs(se.hrvCorrelation.avgDeviation) > 10) se.score = (se.score || 0) + 10;
    }
    filteredEvents.sort((a, b) => (b.score || 0) - (a.score || 0));
  } catch (boostErr: any) {
    console.warn('[generate-mastery-plan] strategic boost failed:', boostErr?.message);
  }

  // Observability: log calendar scoring summary
  console.log(`[generate-mastery-plan] Calendar: ${req.calendarEvents?.length || 0} events fetched, ${scoredEvents.length} scored, ${filteredEvents.length} after suppression. Top event: ${filteredEvents[0]?.event.title || 'none'} (score: ${filteredEvents[0]?.score || 0})`);

  // State hash for coach card versioning – ensures refreshed state gets new coach cards
  const coachStateHash = String(hashCode(`${req.innerReadinessTier}:${req.checkInOutcome}:${req.innerReadinessScore}:${req.outerReadinessPhrase}:${timeOfDay}`));

  // 4. Build calendar pills (max 2)
  const calendarPills = filteredEvents.slice(0, 2).map(e => ({
    label: e.scenario ? `${e.scenario.contextLabel}` : e.event.title || 'Upcoming Event',
    eventId: e.event.id,
    priorityScore: e.score,
    timePill: e.timePill
  }));

  // 5. Build pre-event plan using TWO-TOUCH ACTION MODEL
  // Touch 1 (6-48h): coach primary CTA + framework + optional focus practice (5-8 min thinking prep)
  // Touch 2 (0-6h): somatic primary + focus exercise + coach secondary (3-5 min body prep)
  // Selection-only (>48h): nothing surfaces. Per-event suppression via dismissed_horizons.
  let preEventPlan: any = null;

  // Phase B: rank (event, phase) candidates against §3/§4. This now drives
  // top-event selection for the visible pre-event plan, while the older
  // filtered-event loop remains only as a defensive fallback until the rest
  // of the bridge cleanup lands.
  const nowMsForJit = Date.now();
  let jitRankedCandidates: RankedJitCandidate[] = [];
  try {
    jitRankedCandidates = rankJitCandidates(
      filteredEvents.map(e => {
        let memoryDelta = 0;
        let memoryHardDemote = false;
        if (priorityMemoryIndex) {
          const mem = applyEventPriorityMemory(priorityMemoryIndex, {
            eventCategory: coarseEventType(e.event.title || ''),
            eventTypeKey: normalizeEventTypeKey(e.event.title || ''),
          });
          const derivedKey = `${String(coarseEventType(e.event.title || '') || '').toLowerCase()}::${String(normalizeEventTypeKey(e.event.title || '') || '').toLowerCase()}`;
          const derived = derivedMemoryByKey.get(derivedKey);
          memoryDelta = mem.delta + (derived?.net_importance ?? 0);
          memoryHardDemote = mem.hardDemote;
          if (derived?.permanent_flag && derived.net_importance <= -999) memoryHardDemote = true;
        }
        return {
          event: {
            id: e.event.id,
            title: e.event.title,
            start_time: getCalendarEventStartIso(e.event) ?? '',
            end_time: getCalendarEventEndIso(e.event),
          },
          stakesLevel: (e as any).stakesLevel ?? null,
          score: e.score,
          memoryDelta,
          memoryHardDemote,
        };
      }),
      nowMsForJit,
    );
    // Brief↔Plan parity: re-rank so any candidate whose title matches an
    // event the Brief named as high-stakes (HighStakesPrep / boardLevelOutcome /
    // etc.) is guaranteed to surface — even if its raw §B score was below
    // a higher-scoring noise event. Stable sort: tied items keep §B order.
    try {
      const anchors = new Set(
        briefAnchorEventTitles(shared.briefBehaviour).map((t) => t.toLowerCase().trim()),
      );
      if (anchors.size > 0 && jitRankedCandidates.length > 0) {
        const before = jitRankedCandidates.map((c) => c.title);
        jitRankedCandidates = [...jitRankedCandidates]
          .map((c, i) => ({ c, i, anchored: anchors.has(String(c.title || '').toLowerCase().trim()) }))
          .sort((a, b) => (a.anchored === b.anchored ? a.i - b.i : (a.anchored ? -1 : 1)))
          .map(({ c }) => c);
        const after = jitRankedCandidates.map((c) => c.title);
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          console.log(
            `[generate-mastery-plan] JIT reordered for brief anchors=${Array.from(anchors).join('|')}: ${before.join(' > ')} → ${after.join(' > ')}`,
          );
        }
      }
    } catch (anchorErr: any) {
      console.warn('[generate-mastery-plan] brief-anchor JIT reorder skipped:', anchorErr?.message);
    }
    const top3 = jitRankedCandidates.slice(0, 3).map(c => `${c.title}/${c.phase}=${c.score}`).join(' | ');
    console.log(`[generate-mastery-plan] jitRankedCandidates: ${jitRankedCandidates.length} total. top3: ${top3 || 'none'}`);
  } catch (rankErr: any) {
    console.warn('[generate-mastery-plan] rankJitCandidates failed:', rankErr?.message);
  }

  // ────────────────────────────────────────────────────────────────────
  // JIT v2 shadow run — non-blocking, behind JIT_V2=shadow|on.
  // PR 1: writes shadow columns only; never affects user-visible output.
  // ────────────────────────────────────────────────────────────────────
  const JIT_V2_MODE = (Deno.env.get('JIT_V2') || '').toLowerCase();
  console.log(`[generate-mastery-plan][jit-v2-shadow] gate JIT_V2="${JIT_V2_MODE}" scored=${scoredEvents.length} filtered=${filteredEvents.length}`);
  // Treat any non-empty value other than the explicit disables as shadow-on.
  const jitV2Enabled = JIT_V2_MODE !== '' && JIT_V2_MODE !== 'off' && JIT_V2_MODE !== 'false' && JIT_V2_MODE !== '0';
  if (jitV2Enabled) {
    runJitV2Shadow(supabaseClient, req.userId, scoredEvents, filteredEvents, req).catch((e) =>
      console.warn('[generate-mastery-plan][jit-v2-shadow] failed:', e?.message),
    );
  }

  let topEvent: ScoredEvent | null = null;
  const sharedTopCandidate = jitRankedCandidates.find((candidate) => candidate.phase === 'pre');
  if (sharedTopCandidate && sharedTopCandidate.score >= JIT_THRESHOLD_UNIFIED) {
    const mappedEvent = findScoredEventForCandidate(filteredEvents, sharedTopCandidate);
    if (mappedEvent) {
      const window = getActionWindow(mappedEvent.minutesUntil);
      if (window === 'touch1' || window === 'touch2') {
        topEvent = mappedEvent;
        console.log(
          `[generate-mastery-plan] topEvent selected from shared ranking: "${mappedEvent.event.title}" phase=${sharedTopCandidate.phase} score=${sharedTopCandidate.score} minutesUntil=${mappedEvent.minutesUntil}`,
        );
      }
    }
  }

  if (!topEvent) {
    // Defensive fallback while the remaining legacy bridge is still present.
    for (const evt of filteredEvents) {
      if (evt.score < JIT_THRESHOLD_UNIFIED) {
        console.log(`[generate-mastery-plan] JIT candidate EXCLUDED: "${evt.event.title}" – score=${evt.score} < threshold=${JIT_THRESHOLD_UNIFIED}`);
        continue;
      }
      const window = getActionWindow(evt.minutesUntil);
      if (window === 'touch1' || window === 'touch2') {
        topEvent = evt;
        console.log(
          `[generate-mastery-plan] topEvent selected from legacy fallback: "${evt.event.title}" score=${evt.score} minutesUntil=${evt.minutesUntil}`,
        );
        break;
      }
      console.log(`[generate-mastery-plan] JIT candidate EXCLUDED: "${evt.event.title}" – window=${window} minutesUntil=${evt.minutesUntil} score=${evt.score}`);
    }
  }

  if (topEvent) {
    const scenario = topEvent.scenario;
    const actionWindow = getActionWindow(topEvent.minutesUntil);
    const horizon = actionWindow === 'touch1' ? 'touch_1' : 'touch_2';
    const preEventModules: any[] = [];

    console.log(`[generate-mastery-plan] Two-touch: "${topEvent.event.title}" window=${actionWindow} horizon=${horizon} score=${topEvent.score} minutesUntil=${topEvent.minutesUntil}`);

    if (actionWindow === 'touch2') {
      // ═══ TOUCH 2 (0-6h): BODY PREP – somatic-first, 3-5 min max ═══
      // Primary: somatic/breathing regulation practice (gentle, micro/short)
      const somaticSpec: ModuleSpec = { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'micro', focus: 'composure' };
      const somaticContent = selectContent(enrichedContent, somaticSpec, req, pendingCommitments);
      if (somaticContent) {
        preEventModules.push({
          type: 'regulate',
          contentId: somaticContent.id,
          title: somaticContent.title,
          contentType: somaticContent.content_type,
          duration: somaticContent.duration,
          focus: 'composure',
          intensity: 'gentle',
          isFavorite: req.favorites.includes(somaticContent.id),
          reasoning: `Settle your body before ${topEvent.event.title?.split(' ').slice(0, 4).join(' ') || 'this event'}`
        });
      }
      // Secondary: one short focus/grounding exercise
      const focusSpec: ModuleSpec = { type: 'align', required: false, priority: 6, intensity: 'gentle', duration: 'micro', focus: 'grounding' };
      const focusContent = selectContent(enrichedContent, focusSpec, req, pendingCommitments);
      if (focusContent) {
        preEventModules.push({
          type: 'align',
          contentId: focusContent.id,
          title: focusContent.title,
          contentType: focusContent.content_type,
          duration: focusContent.duration,
          focus: 'grounding',
          intensity: 'gentle',
          isFavorite: req.favorites.includes(focusContent.id),
          reasoning: `Get focused and grounded before ${topEvent.event.title?.split(' ').slice(0, 4).join(' ') || 'this event'}`
        });
      }
      // Coach card as secondary CTA only
      preEventModules.push({
        type: 'prepare',
        contentId: 'coach-prepare',
        title: 'Quick Coach Check-in',
        contentType: 'coach',
        duration: 2,
        focus: 'composure',
        intensity: 'gentle',
        isFavorite: false,
        isCoachCard: true,
        reasoning: 'Quick check-in if you need it'
      });
    } else {
      // ═══ TOUCH 1 (24-48h): THINK PREP – coach primary, framework, 5-8 min ═══
      // Primary: coach card (prepare type) as main CTA
      preEventModules.push({
        type: 'prepare',
        contentId: 'coach-prepare',
        title: 'Prepare with Your Coach',
        contentType: 'coach',
        duration: 3,
        focus: 'composure',
        intensity: 'moderate',
        isFavorite: false,
        isCoachCard: true,
        reasoning: scenario ? `Discuss your ${scenario.contextLabel.toLowerCase()} approach with your coach` : `Discuss your approach with your coach before ${topEvent.event.title?.split(' ').slice(0, 4).join(' ') || 'this event'}`
      });
      // Secondary: one mental framework / reframe / align practice
      const frameworkSpec: ModuleSpec = { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' };
      const frameworkContent = selectContent(enrichedContent, frameworkSpec, req, pendingCommitments);
      if (frameworkContent) {
        preEventModules.push({
          type: 'align',
          contentId: frameworkContent.id,
          title: frameworkContent.title,
          contentType: frameworkContent.content_type,
          duration: frameworkContent.duration,
          focus: 'confidence',
          intensity: 'moderate',
          isFavorite: req.favorites.includes(frameworkContent.id),
          reasoning: `Mental framework to sharpen your approach for ${topEvent.event.title?.split(' ').slice(0, 4).join(' ') || 'this event'}`
        });
      }
      // Optional: one focus practice if scenario matched
      if (scenario) {
        const focusSpec: ModuleSpec = { type: 'regulate', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'focus' };
        const focusContent = selectContent(enrichedContent, focusSpec, req, pendingCommitments);
        if (focusContent) {
          preEventModules.push({
            type: 'regulate',
            contentId: focusContent.id,
            title: focusContent.title,
            contentType: focusContent.content_type,
            duration: focusContent.duration,
            focus: 'focus',
            intensity: 'gentle',
            isFavorite: req.favorites.includes(focusContent.id),
            reasoning: `Optional focus practice for deeper ${scenario?.contextLabel?.toLowerCase() || 'event'} preparation`
          });
        }
      }
    }

    // ═══ ENRICH CONTEXT – Coach Memory + HRV as Lead Context ═══
    let enrichedContextDescription = topEvent.contextDescription || '';
    const eventTitleLower = (topEvent.event.title || '').toLowerCase();
    const eventTitleShort = topEvent.event.title?.split(' ').slice(0, 4).join(' ') || 'this event';
    
    // Check if any pending coach commitment mentions this event
    const relevantCommitment = pendingCommitments.find((c: any) => {
      const commitText = (c.commitment_text || '').toLowerCase();
      return eventTitleLower.split(' ').some((word: string) => word.length > 3 && commitText.includes(word));
    });

    // Check for pattern observations related to this event type
    let patternMatched = false;
    if (scenario && req.patternInsight) {
      // Canonical pattern↔scenario match: route the pattern state text through
      // the same classifier used to detect the scenario. No local keyword table.
      const patternState = (req.patternInsight.state || '').trim();
      if (patternState) {
        const patternScenarioId = scenarioIdFor(patternState);
        patternMatched = !!patternScenarioId && patternScenarioId === scenario.id;
      }
    }

    // Aggressively replace context – coach memory and HRV take priority over generic text
    if (relevantCommitment && patternMatched) {
      enrichedContextDescription = `You discussed this with your coach and a pattern has been noted – ${topEvent.timePill?.toLowerCase() || 'upcoming'}. Prepare with targeted practice.`;
    } else if (relevantCommitment) {
      enrichedContextDescription = `You discussed this with your coach – ${topEvent.timePill?.toLowerCase() || 'upcoming'}. Prepare with targeted practice.`;
    } else if (patternMatched) {
      enrichedContextDescription = `Your coach has noted a pattern here – ${topEvent.timePill?.toLowerCase() || 'upcoming'}. Prepare with targeted practice.`;
    } else if (topEvent.hrvCorrelation && Math.abs(topEvent.hrvCorrelation.avgDeviation) > 10 && !enrichedContextDescription) {
      // HRV as lead context when no coach signals and context is empty
      const canonicalLabel = canonicalTagForCoarse(topEvent.hrvCorrelation.eventType);
      enrichedContextDescription = `Your HRV typically shifts ${Math.abs(topEvent.hrvCorrelation.avgDeviation)}% during ${canonicalLabel.toLowerCase()} events – ${topEvent.timePill?.toLowerCase() || 'upcoming'}. Prepare with targeted practice.`;
    }

    if (preEventModules.length > 0) {
      preEventPlan = {
        eventTitle: topEvent.event.title,
        eventType: canonicalEventTag(topEvent.event.title || '') || scenario?.contextLabel || 'Meeting Prep',
        minutesUntil: topEvent.minutesUntil,
        timePill: topEvent.timePill,
        contextDescription: enrichedContextDescription,
        modules: preEventModules,
        coachCard: generateCoachCard('prepare', timeOfDay, req.innerReadinessTier, req.patternInsight, topEvent.event.title, topEvent.minutesUntil, coachStateHash),
        progressTracked: false,
        hrvCorrelation: topEvent.hrvCorrelation || null,
        actionWindow: actionWindow,
        horizon: horizon,
        eventId: topEvent.event.id,
      };
      console.log(`[generate-mastery-plan] preEventPlan built: "${topEvent.event.title}" window=${actionWindow} horizon=${horizon} with ${preEventModules.length} modules (scenario: ${scenario?.id || 'fallback'})`);
    } else {
      console.log(`[generate-mastery-plan] preEventPlan skipped: no modules resolved for "${topEvent.event.title}"`);
    }
  } else {
    const reason = filteredEvents.length === 0 ? 'no calendar events' : `no events in action window (top: "${filteredEvents[0]?.event.title}" score=${filteredEvents[0]?.score || 0} minutesUntil=${filteredEvents[0]?.minutesUntil || 0})`;
    console.log(`[generate-mastery-plan] preEventPlan=null: ${reason}`);
  }

  // Collect JIT content IDs to exclude from ToD plan (prevent duplicate practices)
  const jitContentIds = new Set<string>();
  if (preEventPlan?.modules) {
    for (const m of preEventPlan.modules) {
      if (m.contentId && !m.isCoachCard) {
        jitContentIds.add(m.contentId);
      }
    }
  }
  if (jitContentIds.size > 0) {
    console.log(`[generate-mastery-plan] Excluding ${jitContentIds.size} JIT content IDs from ToD selection: ${[...jitContentIds].join(', ')}`);
  }

  // 6. Build time-of-day plan
  const { maxModules } = getDurationCeiling(req.calendarLoad);
  const baseMapping = getModulesFromTheme(req.outerReadinessPhrase);

  // Calendar-context density overrides – adjust module focus/intensity based on actual calendar load
  const calendarContext = calculateCalendarContext(rawCalendarEvents, timeOfDay);
  const moduleMapping = applyCalendarOverrides(baseMapping, calendarContext, timeOfDay, req.innerReadinessTier);
  // Build resolved modules list for module-derived rationale
  const resolvedModuleTypes = Object.entries(moduleMapping)
    .filter(([_, spec]) => spec)
    .map(([type, spec]) => ({ type, focus: (spec as any).focus }));

  // Determine JIT priority: if preEventPlan exists and is in touch_2 window
  const jitPriority = !!(preEventPlan && topEvent && getActionWindow(topEvent.minutesUntil) === 'touch2');

  // Next event info for urgency frame
  const nextEvtTitle = topEvent?.event.title || null;
  const nextEvtMins = topEvent?.minutesUntil || null;

  const planBrief = generatePlanBrief(calendarContext, timeOfDay, req.innerReadinessTier, req.innerReadinessScore, req.checkInOutcome, req.calendarLoad, req.wearableContext, req.outerReadinessPhrase, req.outerReadinessContext, req.outerReadinessLeanOn, req.coachInsights, resolvedModuleTypes, combinedAlreadyUsed, nextEvtTitle, nextEvtMins, pendingCommitments, shared.calendarGaps);
  console.log(`[generate-mastery-plan] calendarContext: todayLoad=${calendarContext.todayLoad} (${calendarContext.todayMeetingCount} mtgs, ${calendarContext.todayMeetingHours}h), upcomingLoad=${calendarContext.upcomingLoad} (${calendarContext.upcomingMeetingCount} mtgs), planBrief=${planBrief}`);

  // Evening: always ensure Regulate + Align (grounding) + Integrate modules are present (even without check-in)
  if (timeOfDay === 'evening') {
    if (!moduleMapping.regulate) {
      moduleMapping.regulate = { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'release' };
    }
    if (!moduleMapping.align) {
      moduleMapping.align = { type: 'align', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' };
    }
    if (!moduleMapping.integrate) {
      moduleMapping.integrate = { type: 'integrate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'release' };
    }
  }

  // Afternoon: suppress Prepare unless scenario detected
  if (timeOfDay === 'afternoon' && moduleMapping.prepare && filteredEvents.length === 0) {
    delete moduleMapping.prepare;
  }

  // Evening: suppress Prepare unless high-priority event within 18 hours
  if (timeOfDay === 'evening' && moduleMapping.prepare) {
    const hasNearEvent = filteredEvents.some(e => e.minutesUntil <= 18 * 60);
    if (!hasNearEvent) delete moduleMapping.prepare;
  }

  // ── CEO behaviour wiring (Brief↔Plan parity, canonical) ──
  // We no longer re-call `evaluateForScope` here — that path drifted from
  // the Brief because the SignalCoverageInput differed (no tomorrowEvents,
  // no trailingClarityAvg, etc.). Instead, consume the snapshot the Brief
  // already wrote (`shared.briefBehaviour`) so the Plan applies the exact
  // same slotBoosts the Brief's flagsPlan implied. Source is logged in
  // buildSharedContext; rebuild fallback already happened there.
  try {
    const wiring = snapshotToWiring(shared.briefBehaviour, 'plan');
    if (wiring && wiring.slotBoosts.length > 0) {
      const safeSlotBoosts = wiring.slotBoosts.filter((boost) => {
        const sharedPref = PRACTICE_TYPE_TO_COMBO[boost.practiceType];
        const comboKey = sharedPref
          ? `${sharedPref.protocol}.${sharedPref.mode}` as ComboKey
          : null;
        if (comboKey && !PROTOCOL_COMBOS[comboKey]) {
          console.warn(
            `[generate-mastery-plan] dropped slot boost with unknown combo ${comboKey} from reason=${boost.reason}`,
          );
          return false;
        }
        return true;
      });
      const { applied } = applySlotBoostsToMapping(
        moduleMapping as any,
        safeSlotBoosts,
        timeOfDay as 'morning' | 'afternoon' | 'evening',
      );
      if (applied.length > 0) {
        console.log(
          `[generate-mastery-plan] behaviour boosts applied (${timeOfDay}) source=${shared.briefBehaviourSource} sig=${shared.briefBehaviour?.signatureHash}:`,
          JSON.stringify(applied),
        );
      }
    } else {
      console.log(
        `[generate-mastery-plan] no behaviour boosts for ${timeOfDay} source=${shared.briefBehaviourSource}`,
      );
    }
  } catch (e) {
    console.warn('[generate-mastery-plan] behaviour snapshot apply skipped:', e);
  }

  const todModules: any[] = [];
  const moduleOrder: ('regulate' | 'align' | 'prepare' | 'integrate')[] = ['regulate', 'align', 'prepare', 'integrate'];

  // Filter out content already used in JIT plan – computed once, used by all modules
  const todCandidates = jitContentIds.size > 0
    ? enrichedContent.filter((c: any) => !jitContentIds.has(c.id))
    : enrichedContent;

  for (const moduleType of moduleOrder) {
    if (todModules.length >= maxModules) break;
    const spec = moduleMapping[moduleType];
    if (!spec) continue;

    // Skip optional modules if 3+ required already
    const requiredCount = todModules.filter(m => m.required).length;
    if (!spec.required && requiredCount >= 3) continue;

    if (moduleType === 'prepare' || moduleType === 'integrate') {
      // Coach cards
      const coachCard = generateCoachCard(moduleType, timeOfDay, req.innerReadinessTier, req.patternInsight, undefined, undefined, coachStateHash);
      if (coachCard) {
        todModules.push({
          type: moduleType,
          contentId: coachCard.id,
          title: coachCard.title,
          contentType: 'coach',
          duration: coachCard.duration,
          focus: spec.focus,
          intensity: spec.intensity,
          isFavorite: false,
          isCoachCard: true,
          reasoning: moduleType === 'prepare' ? 'Prepare your mindset for what\'s coming – arrive ready, not reactive' : 'Capture what went well today and close with intention – this prevents rumination overnight',
          required: spec.required
        });
      }
    } else {
      const selected = selectContent(todCandidates, spec, req, pendingCommitments);
      if (selected) {
        todModules.push({
          type: moduleType,
          contentId: selected.id,
          title: selected.title,
          contentType: selected.content_type,
          duration: selected.duration,
          focus: spec.focus,
          intensity: spec.intensity,
          isFavorite: req.favorites.includes(selected.id),
           reasoning: getContextualReasoning(moduleType, spec.focus, req.innerReadinessTier, req.checkInOutcome, req.calendarLoad, timeOfDay, req.wearableContext, req.outerReadinessPhrase),
          required: spec.required,
          thumbnailUrl: selected.thumbnail_url
        });
      } else if (timeOfDay === 'evening') {
        // Fallback: try to find unfinished content from DB for this module type
        const fallbackCategory = moduleType === 'regulate' ? 'somatic' : 'mindset';
        const fallbackItem = todCandidates.find((c: any) => c.category === fallbackCategory && !req.completedToday.includes(c.id));
        if (fallbackItem) {
          todModules.push({
            type: moduleType,
            contentId: fallbackItem.id,
            title: fallbackItem.title,
            contentType: fallbackItem.content_type,
            duration: fallbackItem.duration,
            focus: spec.focus,
            intensity: spec.intensity,
            isFavorite: req.favorites.includes(fallbackItem.id),
            reasoning: getContextualReasoning(moduleType, spec.focus, req.innerReadinessTier, req.checkInOutcome, req.calendarLoad, timeOfDay, req.wearableContext, req.outerReadinessPhrase),
            required: spec.required,
            thumbnailUrl: fallbackItem.thumbnail_url
          });
        }
        // If no unfinished content exists, skip the module entirely – never resurface completed
      }
    }
  }

  // 7. Coach card synthetic injection — REMOVED per
  // mem://features/coach/suppression-standard. The previous block
  // hard-coded "Brief coaching check-in" into slot 3/evening and seeded
  // "Evening reflection and tiny wins capture" as a default fallback,
  // which leaked Coach + Tiny Wins into Practice even when the Coach
  // feature is suppressed for the user. Coach/Tiny Wins modules can
  // still appear only when the practice/recalibration selector chooses
  // them on their own merits (existing prepare/integrate slot above).
  const todCoachCard: any = null;

  // Calculate total duration
  const totalDuration = todModules.reduce((sum, m) => sum + (m.duration || 0), 0);

  // Time-of-day label
  const periodLabels: Record<string, string> = {
    morning: 'Morning Practice',
    afternoon: 'Afternoon Reset',
    evening: 'Evening Close'
  };

  const { maxDuration } = getDurationCeiling(req.calendarLoad);

  // ════════════════════════════════════════════
  // BUILD HORIZON MODULES (Today's 3 Performance Priorities)
  // ════════════════════════════════════════════

  const horizonModules = buildHorizonModules(
    todModules, preEventPlan, topEvent, req, shared, hrvCorrelations,
    timeOfDay, todCoachCard, enrichedContent, pendingCommitments, outerReadinessCache,
    jitRankedCandidates,
  );

  // ═══════════════════════════════════════════════════════════════
  // STATEFUL PLAN EVOLUTION — merge with today's persisted ledger
  // (Refs: refinement memo "Lifecycle of a Daily Plan")
  //
  // Rules:
  //  1. Sticky completion: a slot whose primary practice is in
  //     completedToday stays VERBATIM in its slotIndex with ✓.
  //  2. JIT anchor: a slot bound to a calendar event whose event still
  //     exists today keeps slotIndex/jitEventTitle/horizon/timeLabel —
  //     practices + whyLine may refresh when context materially changed.
  //  3. Otherwise the fresh slot wins.
  //  4. "Unfinished business": as long as ANY slot from the ledger is
  //     incomplete, the new plan is an evolution of the ledger. Only when
  //     all 3 ledger slots are completed do we hand off to a fresh
  //     "Bonus Round" plan with a victoryLine.
  // ═══════════════════════════════════════════════════════════════
  let finalHorizonModules = horizonModules;
  let ledgerMeta: {
    source: 'fresh' | 'ledger-evolution' | 'bonus-round';
    carriedSlots: number;
    anchoredSlots: number;
    completedSlots: number;
    victoryLine?: string;
  } = { source: 'fresh', carriedSlots: 0, anchoredSlots: 0, completedSlots: 0 };

  let ledger: PlanLedger | null = null;
  try {
    ledger = await loadTodayPlanLedger(req.userId, today, supabaseClient);
    const calendarEventIds = new Set<string>(
      (req.calendarEvents || []).map((e: any) => String(e.id)).filter(Boolean)
    );
    const calendarEventTitles = new Set<string>(
      (req.calendarEvents || []).map((e: any) => String(e.title || '').trim()).filter(Boolean)
    );
    const calendarEventTitleById = new Map<string, string>(
      (req.calendarEvents || [])
        .map((e: any): [string, string] => [String(e.id), String(e.title || '').trim()])
        .filter(([id, title]) => Boolean(id) && Boolean(title))
    );

    const merged = mergeWithLedger(
      horizonModules,
      ledger?.modules || [],
      new Set<string>(req.completedToday || []),
      calendarEventIds,
      calendarEventTitles,
      ledger?.userEdits,
      calendarEventTitleById,
      // Sprint 2 (Phase 3): pass REAL current-window allocator context so
      // the ledger-evolution path derives the same day-shape / mode as the
      // fresh-generation path. `jitRankedCandidates` is populated ~525
      // lines up from the same request's calendar events.
      {
        nowMs: Date.now(),
        rankedCandidates: jitRankedCandidates,
        ...deriveStructuralDayFlags(req.calendarEvents, (req as any).calendarLoad),
      },
    );
    finalHorizonModules = merged.modules;
    ledgerMeta = {
      source: merged.source,
      carriedSlots: merged.carriedSlots,
      anchoredSlots: merged.anchoredSlots,
      completedSlots: merged.completedSlots,
      victoryLine: merged.victoryLine,
    };
    finalHorizonModules = applyLedgerEditsToModules(finalHorizonModules, ledger?.userEdits);
    console.log('[generate-mastery-plan] ledger', {
      userId: req.userId,
      today,
      currentPeriod: timeOfDay,
      hasLedger: !!ledger,
      ledgerGeneratedAt: ledger?.generatedAt || null,
      ...ledgerMeta,
    });
  } catch (ledgerErr) {
    console.warn('[generate-mastery-plan] ledger merge failed, falling back to fresh modules:',
      ledgerErr instanceof Error ? ledgerErr.message : ledgerErr);
  }

  // v5.1: enrich whyLine + stepRationale + slotKind without changing UI structure.
  try {
    finalHorizonModules = await applyV51Enrichment(
      finalHorizonModules, req, shared, hrvCorrelations, outerReadinessCache, timeOfDay,
    );
  } catch (enrichErr: any) {
    console.warn('[generate-mastery-plan] v5.1 enrichment failed:', enrichErr?.message);
  }

  // ── Per-slot replacement override ─────────────────────────────────────
  // Strictly 1:1: each entry in req.slotReplacements pins one calendar
  // event to one slot index. We anchor that slot to a fresh module that
  // matches the chosen event and leave every other slot untouched. This
  // runs after merge+enrich so that:
  //  - When a ledger already records the edit, mergeWithLedger's Rule 3a
  //    has already placed the right content; this override is a no-op or
  //    idempotent reinforcement.
  //  - When the ledger hasn't yet caught up (race on first regen after
  //    the client's persist), this override still binds the event to the
  //    exact slot index the user clicked instead of letting it bubble to
  //    slot 1 via fresh ordering.
  try {
    const slotReplacements = (req.slotReplacements && typeof req.slotReplacements === 'object')
      ? req.slotReplacements
      : {};
    for (const [slotKey, value] of Object.entries(slotReplacements)) {
      const idx = Number(slotKey);
      if (!Number.isInteger(idx) || idx < 0 || idx >= finalHorizonModules.length) continue;
      const eventId = (value as any)?.eventId;
      if (typeof eventId !== 'string' || !eventId) continue;
      const evt = (req.calendarEvents || []).find((e: any) => String(e.id) === String(eventId));
      if (!evt) continue;
      const matchTitle = String(evt.title || '').trim().toLowerCase();
      if (!matchTitle) continue;
      const freshMatch = horizonModules.find((m: HorizonModule) =>
        m.isJit && (m.jitEventTitle || '').toLowerCase().trim() === matchTitle,
      ) || horizonModules.find((m: HorizonModule) => {
        const t = (m.jitEventTitle || '').toLowerCase().trim();
        return !!t && (t.includes(matchTitle) || matchTitle.includes(t));
      });
      const prior = finalHorizonModules[idx];
      // Skip if this exact slot is already anchored to the requested event.
      const alreadyAnchored = (prior?.replacementEventIds || []).includes(eventId) ||
        ((prior?.jitEventTitle || '').toLowerCase().trim() === matchTitle && !prior?.isCancelled);
      if (alreadyAnchored) continue;
      const truncatedEvtTitle = String(evt.title || '').split(/\s+/).slice(0, 5).join(' ').trim();
      const prepareLabel = `Prepare ahead of ${truncatedEvtTitle}`;
      const minsUntilEvt = (new Date(evt.startTime).getTime() - Date.now()) / 60000;
      // Use fresh match if present, otherwise synthesize from prior so the
      // slot is always re-anchored to the chosen event with Prepare framing.
      const base = freshMatch || prior;
      if (!base) continue;
      finalHorizonModules[idx] = {
        ...base,
        isJit: true,
        jitEventTitle: truncatedEvtTitle,
        jitMinutesUntil: Number.isFinite(minsUntilEvt) ? Math.round(minsUntilEvt) : null,
        timeLabel: prepareLabel,
        isCancelled: false,
        cancelReason: null,
        replacementEventIds: [eventId],
        showPriorityPill: true,
        priorityTag: prior?.priorityTag ?? null,
        relationshipTag: prior?.relationshipTag ?? null,
        customTags: prior?.customTags ?? [],
      };
      console.log('[generate-mastery-plan] per-slot replacement applied', {
        slotIndex: idx, eventId, eventTitle: evt.title,
      });
    }
  } catch (overrideErr: any) {
    console.warn('[generate-mastery-plan] slot replacement override failed:', overrideErr?.message);
  }

  // ── Final cross-slot event dedupe ─────────────────────────────────────
  // Idempotent guard: after mergeWithLedger, applyV51Enrichment, and the
  // per-slot replacement override, no calendar event may anchor more slots
  // than its CATEGORY_MAX_SLOTS cap (C/E/B/H = 1; A/D = 2; F/G = 3) and no
  // event may be anchored to the same §4 phase twice. This is the last
  // line of defence against "the same event becomes 2-3 visible plans"
  // when the ledger evolves, a slot replacement merges with a fresh JIT
  // pick, or two horizon picks happen to land on the same anchor.
  // Preserves the FIRST valid slot for each event and replaces later
  // duplicates with a fresh unused module (preferring one anchored to a
  // different event) or strips JIT framing if no alternative exists.
  try {
    const eventIdByTitleLower = new Map<string, string>();
    const categoryByEventId = new Map<string, any>();
    for (const e of (req.calendarEvents || [])) {
      const t = String((e as any).title || '').trim().toLowerCase();
      const id = String((e as any).id || '');
      if (!id) continue;
      if (t) eventIdByTitleLower.set(t, id);
      try {
        const enr = enrichEvent(e as any);
        categoryByEventId.set(id, enr?.categoryId ?? null);
      } catch { /* enrich failure → cap defaults to 1 */ }
    }
    const slotEventId = (m: HorizonModule): string | null => {
      if (m.anchorEventId) return String(m.anchorEventId);
      const r = m.replacementEventIds && m.replacementEventIds[0];
      if (r) return String(r);
      const t = (m.jitEventTitle || '').toLowerCase().trim();
      if (!t) return null;
      if (eventIdByTitleLower.has(t)) return eventIdByTitleLower.get(t)!;
      // Loose match for truncated/normalised titles.
      for (const [k, v] of eventIdByTitleLower.entries()) {
        if (k.includes(t) || t.includes(k)) return v;
      }
      return null;
    };
    const usedFreshIdxs = new Set<number>();
    const useCount = new Map<string, number>();
    const phasesByEvent = new Map<string, Set<string>>();
    const pickFreshAlternative = (
      excludeIds: Set<string>,
    ): { mod: HorizonModule; eid: string | null } | null => {
      for (let i = 0; i < horizonModules.length; i++) {
        if (usedFreshIdxs.has(i)) continue;
        const fm = horizonModules[i];
        const fid = slotEventId(fm);
        if (fid && excludeIds.has(fid)) continue;
        usedFreshIdxs.add(i);
        return { mod: fm, eid: fid };
      }
      return null;
    };
    for (let i = 0; i < finalHorizonModules.length; i++) {
      const m = finalHorizonModules[i];
      const eid = slotEventId(m);
      if (!eid) continue;
      const cat = categoryByEventId.get(eid);
      const cap = (CATEGORY_MAX_SLOTS as any)[cat] ?? 1;
      const used = useCount.get(eid) ?? 0;
      const phaseSet = phasesByEvent.get(eid) ?? new Set<string>();
      const phase = (m.jitPhase ?? null) as string | null;
      const phaseDup = phase ? phaseSet.has(phase) : false;
      const overCap = used >= cap;
      if (overCap || phaseDup) {
        const excludeIds = new Set<string>(Array.from(useCount.keys()));
        excludeIds.add(eid);
        const alt = pickFreshAlternative(excludeIds);
        if (alt && alt.mod) {
          finalHorizonModules[i] = {
            ...alt.mod,
            priorityTag: m.priorityTag ?? null,
            relationshipTag: m.relationshipTag ?? null,
            customTags: m.customTags ?? [],
          };
          if (alt.eid) {
            useCount.set(alt.eid, (useCount.get(alt.eid) ?? 0) + 1);
            const ps = phasesByEvent.get(alt.eid) ?? new Set<string>();
            if (alt.mod.jitPhase) ps.add(alt.mod.jitPhase);
            phasesByEvent.set(alt.eid, ps);
          }
          console.log('[generate-mastery-plan] dedupe: replaced duplicate event slot', {
            slotIndex: i, droppedEventId: eid, newEventId: alt.eid,
            reason: phaseDup ? 'phase-dup' : 'cap-exceeded', cap,
          });
        } else {
          // No alternative — strip JIT framing so the slot survives without
          // cloning the event. Practices/whyLine stay intact.
          finalHorizonModules[i] = {
            ...m,
            isJit: false,
            jitEventTitle: null,
            jitMinutesUntil: null,
            jitPhase: null,
            replacementEventIds: [],
            showPriorityPill: false,
            showNavyBorder: false,
            showPulse: false,
          };
          console.log('[generate-mastery-plan] dedupe: stripped duplicate event anchor', {
            slotIndex: i, droppedEventId: eid,
            reason: phaseDup ? 'phase-dup' : 'cap-exceeded', cap,
          });
        }
      } else {
        useCount.set(eid, used + 1);
        if (phase) phaseSet.add(phase);
        phasesByEvent.set(eid, phaseSet);
      }
    }
  } catch (dedupeErr: any) {
    console.warn('[generate-mastery-plan] final dedupe pass failed:', dedupeErr?.message);
  }

  // ─── Sprint 4 (Phase 6) — rest-day truncation ─────────────────────────
  // Recompute allocation at the outer level so the Plan snapshot's
  // top-level metadata (and downstream renderers) can distinguish a
  // truthful rest_day from a low/no-stakes workday. When dayShape is
  // rest_day we drop all horizon modules — a rest day must NOT ship
  // three fabricated Performance Priorities. Ledger stays untouched;
  // completed slots from earlier in the day (if any) remain on the
  // ledger row but are not resurfaced as fresh priorities.
  let planDayShape: 'light_routine' | 'dominant_structural_event' | 'mixed_day' | 'rest_day' | null = null;
  let planIsRestDay = false;
  // Observability — surface the canonical classifier's already-computed
  // state/reason so Plan snapshots record WHY a day was flagged rest/PTO/
  // holiday. Read-only; does not affect plan behavior.
  let planAvailabilityMeta: {
    state: string;
    reason: string;
    isRestDay: boolean;
    meetingCount: number;
    holiday: { detected: boolean; applicable: boolean; title?: string; scope?: string };
  } | null = null;
  try {
    const outerAllocation = allocatePlanSlots({
      nowMs: Date.now(),
      rankedCandidates: jitRankedCandidates,
      ...deriveStructuralDayFlags(req.calendarEvents, (req as any).calendarLoad),
    });
    planDayShape = outerAllocation.dayShape;
    planIsRestDay = outerAllocation.dayShape === 'rest_day';
    try {
      const _events = Array.isArray(req.calendarEvents) ? req.calendarEvents : [];
      const _avail = classifyAvailability({
        now: new Date(),
        userHomeCountry: (req as any).userHomeCountry ?? null,
        userCurrentCountry: (req as any).userCurrentCountry ?? null,
        explicitPto: (req as any).explicitPto === true,
        calendarLoad: ((req as any).calendarLoad as any) ?? null,
        events: _events.map((e: any) => ({
          title: String(e?.title || ''),
          startTime: String(e?.startTime || e?.start_time || ''),
          endTime: String(e?.endTime || e?.end_time || e?.startTime || ''),
          isAllDay: e?.isAllDay === true || e?.is_all_day === true,
          isOrganizer: e?.isOrganizer === true || e?.is_organizer === true,
          attendeesCount: Number(e?.attendeesCount ?? e?.attendees_count ?? 0) || 0,
          source: e?.source ?? e?.calendarName ?? null,
          calendarSummary: e?.calendarSummary ?? e?.calendar_summary ?? null,
        })),
      });
      planAvailabilityMeta = {
        state: _avail.state,
        reason: _avail.reason,
        isRestDay: _avail.isRestDay,
        meetingCount: _avail.workEvidence.meetingCount,
        holiday: {
          detected: _avail.holiday.detected,
          applicable: _avail.holiday.applicable,
          title: _avail.holiday.title,
          scope: _avail.holiday.scope,
        },
      };
    } catch (availErr: any) {
      console.warn('[generate-mastery-plan][availability-meta-failed]', availErr?.message ?? String(availErr));
    }
    if (planIsRestDay) {
      const slotCountBefore = finalHorizonModules.length;
      finalHorizonModules = [];
      console.log('[generate-mastery-plan][rest-day]', {
        userId: redactUserId(req.userId),
        date: today,
        window: timeOfDay,
        dayShape: outerAllocation.dayShape,
        mode: outerAllocation.mode,
        slotCount: 0,
        slotCountBefore,
        reason: outerAllocation.allocationReason ?? 'rest_day_no_priorities',
      });
    }
  } catch (restErr: any) {
    console.warn('[generate-mastery-plan][rest-day-check-failed]', restErr?.message ?? String(restErr));
  }

  // Persist the (possibly evolved) ledger onto the current period row so the
  // very next regeneration sees it. Service role bypasses the ledger guard.
  try {
    const planLedger = {
      modules: finalHorizonModules,
      generatedAt: new Date().toISOString(),
      generatedPeriod: timeOfDay,
      source: ledgerMeta.source,
      userEdits: ledger?.userEdits || undefined,
    };
    await supabaseClient
      .from('daily_ritual_completions')
      .upsert(
        {
          user_id: req.userId,
          ritual_date: today,
          session_period: timeOfDay,
          plan_ledger: planLedger,
        },
        { onConflict: 'user_id,ritual_date,session_period' }
      );
  } catch (persistErr) {
    console.warn('[generate-mastery-plan] ledger persist failed:',
      persistErr instanceof Error ? persistErr.message : persistErr);
  }

  return {
    timeOfDayPlan: {
      label: periodLabels[timeOfDay],
      period: timeOfDay,
      modules: todModules,
      coachCard: todCoachCard,
      totalDuration,
      progressTracked: true,
      planBrief: planBrief || undefined
    },
    calendarPills,
    preEventPlan,
    jitPriority,
    horizonModules: finalHorizonModules,
    ledger: ledgerMeta,
    promptVersion: BRIEF_PROMPT_VERSION,
    meta: {
      generatedAt: new Date().toISOString(),
      promptVersion: BRIEF_PROMPT_VERSION,
      scenarioId: filteredEvents[0]?.scenario?.id || null,
      durationCeiling: maxDuration,
      maxModules,
      jitRankedCandidates: jitRankedCandidates.slice(0, 8),
      // Sprint 4 (Phase 6) — surface the day-shape verdict so the frontend
      // can render a truthful rest-day state instead of the empty-shell
      // "check in to build your plan" prompt.
      dayShape: planDayShape,
      restDay: planIsRestDay,
      availability: planAvailabilityMeta,
      calendarContext: calendarContext.todayMeetingCount > 0 || calendarContext.upcomingMeetingCount > 0
        ? { todayLoad: calendarContext.todayLoad, upcomingLoad: calendarContext.upcomingLoad, todayMeetingCount: calendarContext.todayMeetingCount, todayMeetingHours: calendarContext.todayMeetingHours }
        : undefined
    }
  };
}

// ==================== CONTENT SELECTION ====================

function selectContent(contentLibrary: any[], spec: ModuleSpec, req: PlanRequest, pendingCommitments?: any[]): any | null {
  // Filter by module type
  let pool: any[];
  if (spec.type === 'regulate') {
    pool = contentLibrary.filter(c =>
      c.content_type === 'soundbath' ||
      (c.content_type === 'guided-practice' && (
        c.tags?.some((t: string) =>
          t.toLowerCase().includes('breathing') || t.toLowerCase().includes('somatic') || t.toLowerCase().includes('grounding') || t.toLowerCase().includes('calm')
        ) || c.category === 'pause'
      )) ||
      (c.content_type === 'micro-practice' && c.sub_type !== 'mindset' && c.tags?.some((t: string) =>
        t.toLowerCase().includes('breathing') || t.toLowerCase().includes('somatic') || t.toLowerCase().includes('grounding')
      ))
    );
  } else if (spec.type === 'align') {
    pool = contentLibrary.filter(c => c.content_type === 'micro-practice' && c.sub_type === 'mindset');
  } else {
    return null; // prepare/integrate are coach cards
  }

  // Filter out completed today – return null if no unfinished candidates
  const available = pool.filter(c => !req.completedToday.includes(c.id));
  if (available.length === 0) return null; // HARD exclude – never resurface completed content

  // Score
  const scored = available.map(c => ({
    content: c,
    score: calculateContentScore(c, spec, req.favorites, req.coachInsights || [], req.effectiveContent || [], req.completedToday, req.practicePriorityTag, req.pressureContextTag, pendingCommitments)
  }));
  scored.sort((a, b) => b.score - a.score);

  // Deterministic selection from top 3
  const topCandidates = scored.slice(0, Math.min(3, scored.length));
  const today = new Date().toISOString().split('T')[0];
  const seedStr = `${today}-${spec.type}-${spec.focus}`;
  const idx = hashCode(seedStr) % topCandidates.length;

  return topCandidates[idx]?.content || null;
}

function getContextualReasoning(
  moduleType: string,
  focus: string,
  innerReadinessTier: string,
  checkInOutcome: string,
  calendarLoad: string,
  timeOfDay: 'morning' | 'afternoon' | 'evening',
  wearable?: WearableContext,
  outerReadinessPhrase?: string
): string {
  const isDense = calendarLoad === 'extreme' || calendarLoad === 'heavy';
  const isDepleted = innerReadinessTier === 'depleted' || checkInOutcome === 'drained' || checkInOutcome === 'struggling';
  const isEvening = timeOfDay === 'evening';
  const isStrong = innerReadinessTier === 'strong' || innerReadinessTier === 'peak';

  // Wearable notable signals
  const poorSleep = wearable?.hasData && wearable.sleepScore !== null && wearable.sleepScore < 70;
  const lowHRV = wearable?.hasData && wearable.hrvDeviation !== null && wearable.hrvDeviation < -10;

  // Context-aware reasoning per focus area – wearable > readiness > calendar hierarchy
  if (focus === 'composure') {
    if (lowHRV) return 'Your HRV is below baseline – this settles your nervous system before what\'s ahead';
    if (isDepleted && isDense) return 'Your check-in and calendar both flag strain – this settles your nervous system to protect what remains';
    if (isDepleted) return 'Your check-in flagged tension – this settles your nervous system before what\'s ahead';
    if (isDense) return 'A dense calendar demands composure – this practice steadies you for high-stakes moments';
    return 'This practice anchors your composure so you show up grounded, not reactive';
  }
  if (focus === 'release') {
    if (poorSleep && isEvening) return 'Your sleep was disrupted last night – this practice helps discharge residual tension before rest';
    if (isEvening && isDepleted) return 'Your decision readiness is low – this helps discharge accumulated stress so it doesn\'t carry into tomorrow';
    if (isEvening && isDense) return 'After a heavy day, this helps discharge accumulated stress so it doesn\'t carry into tomorrow';
    if (isEvening) return 'Release the day\'s weight – this prevents rumination and protects your rest';
    if (isDepleted) return 'Your system is carrying tension – this practice creates space to let it go';
    return 'Clear mental clutter so your next decision comes from clarity, not residue';
  }
  if (focus === 'grounding') {
    if (isEvening && isDepleted) return 'Your readiness is low – grounding closes the mental loops and protects tonight\'s recovery';
    if (isEvening) return 'Ground yourself before rest – this closes the mental loops still running';
    if (lowHRV && isDepleted) return 'Your HRV and check-in both flag low reserves – grounding reconnects you to a stable centre';
    if (isDepleted) return 'When energy is low, grounding reconnects you to a stable centre';
    return 'This practice anchors your attention so you\'re fully present for what\'s next';
  }
  if (focus === 'focus') {
    if (poorSleep) return 'Your sleep was below baseline – this practice compensates by sharpening cognitive focus';
    if (isDense) return 'With a dense calendar, this narrows your attention to what genuinely matters next';
    if (isDepleted) return 'When depleted, targeted focus prevents you from spreading thin';
    return 'Sharpen your cognitive edge – this practice cuts through noise to priority';
  }
  if (focus === 'confidence') {
    if (isStrong && isDense) return 'Your readiness is high despite a dense day – this channels that into confident presence for what remains';
    if (isStrong) return 'Your readiness is high – this practice channels that into visible, confident presence';
    if (isDepleted) return 'Even when drained, this practice reconnects you to your leadership presence';
    return 'This practice anchors self-assurance so you lead from conviction, not anxiety';
  }
  if (focus === 'restore') {
    if (poorSleep && isDepleted) return 'Your sleep score and check-in both flag low reserves – this practice replenishes at the deepest level';
    if (poorSleep) return 'Your sleep was disrupted – this practice is designed to replenish what rest didn\'t fully restore';
    if (isDepleted && isEvening) return 'Your decision readiness is low – this practice replenishes and prepares your system for deep recovery overnight';
    if (isDepleted) return 'Your energy reserves are low – this practice is designed to replenish, not just relax';
    if (isEvening) return 'Restore what the day took – this prepares your system for deep recovery overnight';
    return 'Top up your reserves now so you have capacity for what remains';
  }

  // Fallback by module type
  if (moduleType === 'integrate') {
    if (isEvening) return 'Capture what went well today and close with intention – this prevents rumination overnight';
    return 'Integrate what you\'ve practised into how you show up next';
  }
  if (moduleType === 'prepare') {
    return 'Prepare your mindset for what\'s coming – arrive ready, not reactive';
  }
  return 'This practice supports your current state and what lies ahead';
}

// ==================== ARCHETYPE WATCH-FOR MAPPING ====================

const ARCHETYPE_WATCH_FOR: Record<string, string> = {
  'The Visionary': 'overcommitting to new ideas before finishing existing ones',
  'The Strategist': 'analysis paralysis and delaying decisive action',
  'The Driver': 'pushing through exhaustion and ignoring recovery signals',
  'The Connector': 'absorbing others\' stress and neglecting your own state',
  'The Architect': 'perfectionism blocking progress on high-stakes deliverables',
  'The Catalyst': 'spreading energy too thin across too many initiatives',
};

// ==================== HORIZON MODULES (Today's 3 Performance Priorities) ====================

interface HorizonModule {
  horizon: 'immediate' | 'tactical' | 'strategic';
  timeLabel: string;
  typeLabel: string;
  whyLine: string;
  recommendedAction: string;
  practice: any; // PlanModule — backward compat (= practices[0])
  practices: any[]; // 1-3 practices per slot
  sequenceReasoning?: string; // Why these practices together in this order
  stepRationale?: string[]; // v5.1: 2–4-word rationale per practice step
  slotKind?: 'start_of_day' | 'jit' | 'end_of_day' | 'state-management'; // v5.1: server-only slot purpose
  ceoRealities?: string[]; // v5.1: tags driving Why composition
  isJit: boolean;
  jitEventTitle: string | null;
  jitMinutesUntil: number | null;
  showNavyBorder: boolean;
  showPulse: boolean;
  showPriorityPill: boolean;
  anchorEventId?: string | null;
  anchorEventTitle?: string | null;
  anchorCategoryId?: EventCategoryId | null;
  anchorSubtypeId?: string | null;
  anchorScenarioId?: string | null;
  anchorLeadTimeMin?: number | null;
  isCancelled?: boolean;
  cancelReason?: string | null;
  replacementEventIds?: string[];
  priorityTag?: 'high' | 'medium' | 'low' | null;
  relationshipTag?: string | null;
  customTags?: string[];
  // Sprint 1–4 identity fields — allocator authoritative for these.
  arcLabel?: 'Prepare' | 'During' | 'Recover' | 'Steady';
  // Phase C: which §4 phase (pre/during/post) the slot anchors against the
  // event. Lets a single JIT event legitimately occupy multiple slots when
  // CATEGORY_MAX_SLOTS allows (G long-haul = 3, F multi-day = 3, A/D = 2).
  // Null for non-JIT or state-anchored slots.
  jitPhase?: 'pre' | 'during' | 'post' | null;
  mode?: 'jit' | 'state' | 'jit+state' | 'full_arc';
  slotRole?: 'start_of_day' | 'dominant_demand' | 'recovery' | 'pre' | 'during' | 'post' | 'state_anchor';
  allocationReason?: string;
  dayShape?: 'light_routine' | 'dominant_structural_event' | 'mixed_day' | 'rest_day';
  slotAllocationDebug?: {
    dayShape: 'light_routine' | 'dominant_structural_event' | 'mixed_day' | 'rest_day';
    mode: 'jit' | 'state' | 'jit+state' | 'full_arc';
    candidateCount: number;
    multiPhaseEligible: boolean;
  };
}

function determineAllocationPattern(
  tier: string,
  calendarLoad: string,
  hasJitEvent: boolean,
  jitMinutesUntil: number | null
): '2immediate-1tactical' | '1immediate-1tactical-1strategic' {
  if (tier === 'depleted') return '2immediate-1tactical';
  if (hasJitEvent && jitMinutesUntil !== null && jitMinutesUntil < 120) return '2immediate-1tactical';
  if (calendarLoad === 'high' || calendarLoad === 'extreme') return '2immediate-1tactical';
  return '1immediate-1tactical-1strategic';
}

// ==================== SLOT CONTEXT (replaces buildWhyLine) ====================

interface SlotContext {
  situation: string;
  whyLine: string;
  sequenceLogic?: string;
}

interface SlotContextInput {
  horizon: 'immediate' | 'tactical' | 'strategic';
  isJit: boolean;
  eventTitle: string | null;
  jitMinutesUntil: number | null;
  tier: string;
  divergenceMode: string | null;
  checkInOutcome: string | null;
  hrvEventCorrelation: { eventType: string; avgHrvDelta: number; occurrences: number } | null;
  patternInsight: { count: number; state: string } | null;
  frictionTrend: string | null;
  scoreTrend: string | null;
  pendingCommitment: string | null;
  coachGrowthArea: string | null;
  practicePriorityTag: string | null;
  archetypeWatchFor: string | null;
  checkInCountTotal: number;
  wearableDaysConnected: number;
  calendarLoad: string | null;
  meetingCount: number;
  clarityLevel: number | null;
  confidenceLevel: number | null;
  timeOfDay: string | null;
  dayOfWeek: string | null;
  // Brief relay signals
  briefPhrase?: string | null;
  briefBody?: string | null;
  briefLeanOn?: string | null;
  briefWatchFor?: string | null;
  // Multi-practice sequence info
  practiceTypes?: string[];
  // Pass 4 — resolved state/filler anchor (event-aware why-line)
  anchorTitle?: string | null;
  anchorCategoryId?: string | null;
  anchorPhase?: 'pre' | 'during' | 'post' | null;
}

function getTimeAnchor(timeOfDay: string | null): string {
  if (timeOfDay === 'morning') return 'before the day starts';
  if (timeOfDay === 'afternoon') return 'before the afternoon compounds';
  return 'before you close the day';
}

/**
 * Pass 4 — anchor-aware temporal phrase. When the state/filler slot resolved
 * to a specific calendar event, prefer "before|during|after <Event>" so the
 * why-line matches the slot title ("Steady the system ahead of <Event>"
 * → "regulate before <Event>"). Falls back to the time-of-day anchor when
 * there's no event anchor.
 */
function getAnchorPhrase(ctx: SlotContextInput): string {
  const title = (ctx.anchorTitle || '').trim();
  if (!title) return getTimeAnchor(ctx.timeOfDay);
  const phase = ctx.anchorPhase || 'pre';
  if (phase === 'during') return `during ${title}`;
  if (phase === 'post') return `after ${title}`;
  return `before ${title}`;
}

function buildEventAwareWhyLine(ctx: SlotContextInput, fallback: string): string {
  const title = (ctx.anchorTitle || ctx.eventTitle || '').trim();
  if (!title) return fallback;

  const anchorPhrase = getAnchorPhrase(ctx);
  const isTravel =
    ctx.anchorCategoryId === 'G' ||
    /\b(flight|travel|airport|long[- ]haul|red[- ]?eye|boarding|departure|arrival|landing)\b/i.test(title);
  const isHighCognitive =
    /\b(pitch|deck|review|proposal|presentation|client|investor|board|strategy|steerco|exec)\b/i.test(title);
  const isRelational =
    ctx.anchorCategoryId === 'D' ||
    /\b(1[: ]?1|one[- ]to[- ]one|feedback|check[- ]?in|sync|wendy)\b/i.test(title);

  if (isTravel) {
    return `Travel is the body/timing load; this protects your rhythm ${anchorPhrase}.`;
  }
  if (isHighCognitive) {
    return `${title} needs clean judgment, this keeps attention narrow ${anchorPhrase}.`;
  }
  if (isRelational) {
    return `${title} asks for presence and context switching, this steadies you ${anchorPhrase}.`;
  }
  return fallback;
}

function buildModuleEventWhyLine(
  hm: HorizonModule,
  eventTitle: string | null,
  categoryId: string | null,
  phase: 'pre' | 'during' | 'post' | undefined,
  fallback = '',
): string {
  const anchorPhase = phase ?? (hm.slotKind === 'end_of_day' ? 'post' : 'pre');
  return buildEventAwareWhyLine({
    horizon: hm.horizon,
    isJit: hm.isJit,
    eventTitle,
    jitMinutesUntil: hm.jitMinutesUntil,
    tier: '',
    divergenceMode: null,
    checkInOutcome: null,
    hrvEventCorrelation: null,
    patternInsight: null,
    frictionTrend: null,
    scoreTrend: null,
    pendingCommitment: null,
    coachGrowthArea: null,
    practicePriorityTag: null,
    archetypeWatchFor: null,
    checkInCountTotal: 0,
    wearableDaysConnected: 0,
    calendarLoad: null,
    meetingCount: 0,
    clarityLevel: null,
    confidenceLevel: null,
    timeOfDay: null,
    dayOfWeek: null,
    anchorTitle: eventTitle,
    anchorCategoryId: categoryId,
    anchorPhase,
  }, fallback);
}

function buildSlotContext(ctx: SlotContextInput): SlotContext {
  const hasWeekData = ctx.checkInCountTotal >= 3;
  const hasWearablePattern = ctx.wearableDaysConnected >= 7;
  const hasCalendar = ctx.meetingCount > 0;
  const timeAnchor = getTimeAnchor(ctx.timeOfDay);
  const anchorPhrase = getAnchorPhrase(ctx);
  const hasEventAnchor = !!(ctx.anchorTitle && ctx.anchorTitle.trim());
  const isEvening = ctx.timeOfDay === 'evening';
  // In evening, today's meetingCount represents meetings already on today's calendar
  // (typically completed), not meetings still ahead. Surface "still left" only when
  // we know meetings remain; otherwise drop the count to avoid contradictions.
  const remainingMeetings = isEvening ? 0 : ctx.meetingCount;
  const hasRemainingMeetings = remainingMeetings > 0;

  // ─── IMMEDIATE ───
  if (ctx.horizon === 'immediate') {
    if (ctx.isJit && ctx.jitMinutesUntil !== null && ctx.jitMinutesUntil < 30) {
      return { situation: `${ctx.eventTitle} is imminent`, whyLine: `${ctx.eventTitle} is almost here, prepare now.` };
    }
    if (ctx.isJit && ctx.jitMinutesUntil !== null && ctx.jitMinutesUntil < 120) {
      // HRV correlation for JIT event
      if (hasWearablePattern && ctx.hrvEventCorrelation && Math.abs(ctx.hrvEventCorrelation.avgHrvDelta) > 10) {
        const pct = Math.abs(Math.round(ctx.hrvEventCorrelation.avgHrvDelta));
        return {
          situation: `HRV pattern before ${ctx.hrvEventCorrelation.eventType}`,
          whyLine: `Your HRV drops avg ${pct}% before ${ctx.hrvEventCorrelation.eventType}, ground your nervous system before that pattern takes over.`
        };
      }
      if (ctx.coachGrowthArea) {
        return {
          situation: `Coach insight + upcoming ${ctx.eventTitle}`,
          whyLine: `Your coach flagged ${ctx.coachGrowthArea}, address your state before ${ctx.eventTitle} so that pattern doesn't drive your thinking.`
        };
      }
      return { situation: `${ctx.eventTitle} approaching`, whyLine: `${ctx.eventTitle} in ${Math.round(ctx.jitMinutesUntil)} mins, go in prepared.` };
    }
    if (ctx.divergenceMode === 'MASKED_HIGH') {
      if (hasCalendar) {
        return {
          situation: 'Body under unregistered load',
          whyLine: isEvening
            ? `Your body is carrying load you haven't registered, settle your system before you close the day.`
            : `Your body is carrying load you haven't registered, ${ctx.meetingCount} meeting${ctx.meetingCount > 1 ? 's' : ''} will compound it unless you settle now.`
        };
      }
      return { situation: 'Body under unregistered load', whyLine: `Your body is carrying load you haven't registered, settle your system ${timeAnchor}.` };
    }
    if (ctx.tier === 'depleted') {
      if (ctx.coachGrowthArea) {
        return { situation: 'Depleted + coach growth area', whyLine: `Your coach flagged ${ctx.coachGrowthArea}, address your state first so that pattern doesn't drive your thinking.` };
      }
      if (isEvening) {
        return { situation: 'Low reserves + day close', whyLine: `Reserves low, regulate before you close the day.` };
      }
      if (hasRemainingMeetings) {
        return { situation: 'Low reserves + calendar load', whyLine: `Reserves low with ${remainingMeetings} meeting${remainingMeetings > 1 ? 's' : ''} ahead, regulate ${anchorPhrase}.` };
      }
      return { situation: 'Low reserves', whyLine: `Reserves low, regulate ${anchorPhrase}.` };
    }
    if (ctx.tier === 'managing' && hasCalendar && ctx.meetingCount > 3) {
      if (isEvening) {
        return { situation: 'Managing + heavy day close', whyLine: `Heavy day, settle your state before you close it.` };
      }
      return { situation: 'Managing + heavy calendar', whyLine: `Heavy day ahead, settle your state ${anchorPhrase}.` };
    }
    if (hasWeekData && ctx.patternInsight && ctx.patternInsight.count >= 3) {
      return {
        situation: `${ctx.patternInsight.count} consecutive ${ctx.patternInsight.state} days`,
        whyLine: `${ctx.patternInsight.count} ${ctx.patternInsight.state} days running, this interrupts the pattern before it becomes your baseline.`
      };
    }
    if (ctx.checkInOutcome && ctx.clarityLevel !== null && ctx.clarityLevel <= 2) {
      return { situation: 'Clarity deficit', whyLine: `Clarity low, address it ${anchorPhrase} so it doesn't compound.` };
    }
    if (ctx.checkInOutcome && ctx.confidenceLevel !== null && ctx.confidenceLevel <= 2) {
      const groundTarget = hasEventAnchor ? anchorPhrase : `before your ${ctx.timeOfDay === 'evening' ? 'next' : 'first'} commitment`;
      return { situation: 'Confidence deficit', whyLine: `Low confidence, ground yourself ${groundTarget}.` };
    }
    if (hasEventAnchor) {
      return {
        situation: `State anchored to ${ctx.anchorTitle}`,
        whyLine: buildEventAwareWhyLine(ctx, `Set your state ${anchorPhrase}, everything downstream rides on it.`),
      };
    }
    if (ctx.timeOfDay === 'morning') return { situation: 'Morning start', whyLine: 'Start with your state, everything follows from this.' };
    if (ctx.timeOfDay === 'afternoon') return { situation: 'Mid-day reset', whyLine: 'Mid-day reset, your second half starts here.' };
    return { situation: 'Evening regulation', whyLine: 'Regulate now, settle before you close the day.' };
  }

  // ─── TACTICAL ───
  if (ctx.horizon === 'tactical') {
    if (ctx.isJit && hasWearablePattern && ctx.hrvEventCorrelation && Math.abs(ctx.hrvEventCorrelation.avgHrvDelta) > 10) {
      const direction = ctx.hrvEventCorrelation.avgHrvDelta > 0 ? 'elevates' : 'drops';
      return {
        situation: `HRV pattern before ${ctx.hrvEventCorrelation.eventType}`,
        whyLine: `Your HRV typically ${direction} before ${ctx.hrvEventCorrelation.eventType}, this sequence grounds your state then sharpens your focus for it.`
      };
    }
    if (ctx.pendingCommitment) {
      return {
        situation: 'Coach commitment active',
        whyLine: `Your coach commitment: '${ctx.pendingCommitment}', this practice directly addresses it while your calendar allows.`
      };
    }
    if (ctx.isJit && hasWeekData && ctx.patternInsight && ctx.patternInsight.count >= 3) {
      return {
        situation: `Pattern + upcoming event`,
        whyLine: `${ctx.eventTitle} approaching, you've been ${ctx.patternInsight.state} ${ctx.patternInsight.count} days running.`
      };
    }
    if (ctx.isJit) {
      return { situation: `${ctx.eventTitle} ahead`, whyLine: `${ctx.eventTitle} is ahead, this prepares your state for it.` };
    }
    if (hasWeekData && ctx.patternInsight && ctx.patternInsight.count >= 3) {
      return {
        situation: `${ctx.patternInsight.count} consecutive ${ctx.patternInsight.state} days`,
        whyLine: `${ctx.patternInsight.count} ${ctx.patternInsight.state} days running, this interrupts the pattern before it becomes your baseline.`
      };
    }
    if (hasWeekData && ctx.frictionTrend === 'declining') {
      return { situation: 'Focus declining', whyLine: 'Focus has been declining this week, this interrupts it.' };
    }
    if (hasWeekData && ctx.scoreTrend === 'declining') {
      return { situation: 'State trending down', whyLine: 'Your state has been trending down, this is the reset point.' };
    }
    if (hasCalendar && ctx.meetingCount >= 4) {
      if (isEvening) {
        return { situation: 'Heavy day completed', whyLine: 'Heavy day completed, sustain your edge into tomorrow.' };
      }
      return { situation: 'Heavy calendar', whyLine: `Heavy day, this keeps you sharp through it.` };
    }
    if (ctx.checkInOutcome && ctx.clarityLevel !== null && ctx.clarityLevel >= 4) {
      const todAnchor = ctx.timeOfDay === 'morning' ? 'afternoon' : ctx.timeOfDay === 'afternoon' ? 'evening' : 'tomorrow';
      return { situation: 'Clarity strong', whyLine: `Clarity strong, this maintains it through the ${todAnchor}.` };
    }
    if (ctx.dayOfWeek === 'Monday' && !isEvening) {
      return { situation: 'Week entry', whyLine: "Monday demands more, this builds the week's foundation." };
    }
    if (ctx.dayOfWeek === 'Friday') {
      return isEvening
        ? { situation: 'Week close', whyLine: 'Week closing, recover what the week pulled from you.' }
        : { situation: 'Week close', whyLine: 'End of week, this sustains your quality through the close.' };
    }
    if (hasEventAnchor) {
      return {
        situation: `Tactical anchor: ${ctx.anchorTitle}`,
        whyLine: buildEventAwareWhyLine(ctx, `Carry your edge ${anchorPhrase}.`),
      };
    }
    if (isEvening) {
      return { situation: 'Day close', whyLine: 'For your state, close the day with intention.' };
    }
    return { situation: 'State maintenance', whyLine: 'For your state and demands today.' };
  }

  // ─── STRATEGIC ───
  if (ctx.horizon === 'strategic') {
    if (hasEventAnchor) {
      return {
        situation: `Development anchor: ${ctx.anchorTitle}`,
        whyLine: buildEventAwareWhyLine(ctx, `Build capacity around ${ctx.anchorTitle}, not just the current state.`),
      };
    }
    if (ctx.pendingCommitment) {
      return {
        situation: 'Coach commitment',
        whyLine: `You committed to '${ctx.pendingCommitment}', your calendar has space to build that capacity now.`
      };
    }
    if (ctx.coachGrowthArea) {
      return {
        situation: 'Coach growth area',
        whyLine: `Your coach identified ${ctx.coachGrowthArea}, this builds it while your system isn't under strain.`
      };
    }
    if (ctx.practicePriorityTag) {
      const tagLabels: Record<string, string> = {
        regulation_composure: 'composure under pressure',
        regulation_early: 'early regulation',
        recovery_resilience: 'recovery and resilience',
        energy_endurance: 'energy and endurance',
        focus_clarity: 'focus and clarity',
        mindset_reframe: 'mindset reframing',
      };
      return {
        situation: 'Development focus',
        whyLine: `Aligned to your ${tagLabels[ctx.practicePriorityTag] || 'development'} focus, building the foundation for long-term change.`
      };
    }
    if (ctx.archetypeWatchFor) {
      return {
        situation: 'Archetype pattern',
        whyLine: `Your pattern: ${ctx.archetypeWatchFor}. Today has space to address it deliberately.`
      };
    }
    if (ctx.timeOfDay === 'evening' && (ctx.tier === 'strong' || ctx.tier === 'peak')) {
      return { situation: 'Strong day close', whyLine: "Strong day, close with intention before tomorrow's demands arrive." };
    }
    if (ctx.timeOfDay === 'evening' && ctx.tier === 'depleted') {
      return { situation: 'Depleted day close', whyLine: 'Depleted day, restore before tomorrow inherits what today carried.' };
    }
    return { situation: 'Development', whyLine: 'For your development, when your system has capacity.' };
  }

  return { situation: 'Current state', whyLine: 'Based on your state today.' };
}

function buildSequenceReasoning(practiceTypes: string[], ctx: SlotContextInput): string | undefined {
  // Static sequence copy retired — read strangely in evening / weekend / depleted contexts.
  // Future: re-enable with time-of-day / day-type / state-aware variants.
  return undefined;
}

// ════════════════════════════════════════════════════════════════════════
// v5.1 STRATEGIC-AWARE POST-PROCESSOR
// Re-composes whyLine using {Strategic. Tactical. Immediate. → Action.}
// with hard anti-duplication against the brief, plus CEO-Reality flags.
// Also derives stepRationale[] (2–4-word sequence rationales) per slot.
// Server-only slotKind (start_of_day | jit | end_of_day | state-management)
// — never surfaced as a UI label.
// ════════════════════════════════════════════════════════════════════════

const MVP_JIT_HORIZON_MINUTES = 24 * 60;

type CeoRealityTag =
  | 'veto_risk'
  | 'circadian_travel'
  | 'decision_leakage'
  | 'post_peak_hangover'
  | 'personal_friction'
  | 'board_outcome'
  | 'public_holiday'
  | 'personal_pto';

/**
 * Map a canonical BehaviourFlag.rule → legacy CeoRealityTag consumed by the
 * Strategic/Tactical/Immediate clause builders. The tag union is preserved
 * verbatim so downstream copy logic (`strategicAnchorClause`, `tacticalClause`,
 * `immediateClause`, `detectMorningFusionEvent`) is untouched.
 *
 * Note: canonical pto-holiday rules collapse public_holiday into a single
 * `ptoTodayAllDay` signal — we surface that as `personal_pto`. The Strategic
 * clause already treats both legacy tags identically, so the user-visible
 * output is unchanged.
 */
const CEO_RULE_TO_TAG: Record<string, CeoRealityTag> = {
  vetoRisk: 'veto_risk',
  postPeakHangover: 'post_peak_hangover',
  boardLevelOutcome: 'board_outcome',
  decisionLeakageGuard: 'decision_leakage',
  decisionLeakageGuardPlan: 'decision_leakage',
  personalFrictionInference: 'personal_friction',
  travelPreFlightMandatory: 'circadian_travel',
  travelLandingOffload: 'circadian_travel',
  travelLandingPlusHighStakes: 'circadian_travel',
  longHaulRecovery: 'circadian_travel',
  postTripReentry: 'circadian_travel',
  travelInFlightConnection: 'circadian_travel',
  holidayReducedTouch: 'personal_pto',
  ptoWithMeetingFallback: 'personal_pto',
};

function detectCeoRealities(req: PlanRequest, shared: SharedContext): CeoRealityTag[] {
  // Brief↔Plan parity: read flags off the Brief's persisted snapshot rather
  // than re-evaluating rules against a fresh (and inevitably divergent)
  // SignalCoverageInput. The snapshot already contains BOTH `flagsBrief` and
  // `flagsPlan`, so the brief-scope-only rules (e.g. personalFrictionInference)
  // are still visible to the Plan. Fallback to local rebuild is handled in
  // buildSharedContext — by the time we reach here, `shared.briefBehaviour`
  // is the canonical record for this (user, local_date, time_window).
  const tags = new Set<CeoRealityTag>();
  const snap = shared.briefBehaviour;
  if (!snap) {
    console.warn('[generate-mastery-plan] detectCeoRealities: no briefBehaviour snapshot — Plan CEO tags will be empty.');
    return [];
  }
  for (const flag of [...snap.flagsBrief, ...snap.flagsPlan]) {
    const mapped = CEO_RULE_TO_TAG[(flag as any)?.rule];
    if (mapped) tags.add(mapped);
  }
  return Array.from(tags);
}

/**
 * Token-set of facts the brief already named — used to forbid the Plan
 * from echoing the same claim. Deterministic, no LLM.
 */
function buildBriefClaimSet(outerReadinessCache: any, req: PlanRequest): Set<string> {
  const claim = new Set<string>();
  const corpus = [
    outerReadinessCache?.phrase,
    outerReadinessCache?.context || outerReadinessCache?.contextStatement,
    outerReadinessCache?.body,
    req.outerReadinessPhrase,
    req.outerReadinessContext,
  ].filter(Boolean).join(' ').toLowerCase();
  if (!corpus) return claim;

  // Numbers + adjacent noun
  const numMatches = corpus.match(/(\d+%?|\d+\s?(?:hr|hrs|hour|hours|min|mins|h|m|ms|bpm|meeting|meetings|days?))/g) || [];
  numMatches.forEach(n => claim.add(n.replace(/\s+/g, '')));

  // Named events from calendar that brief mentions
  for (const e of req.calendarEvents || []) {
    const t = (e.title || '').toLowerCase().trim();
    if (t && t.length >= 4 && corpus.includes(t)) claim.add(`evt:${t}`);
  }

  // Lexicon clusters used
  const clusters = ['hrv', 'sleep', 'rhr', 'clarity', 'confidence', 'composure', 'sharpness', 'recovery', 'resilience', 'readiness'];
  clusters.forEach(c => { if (corpus.includes(c)) claim.add(`lex:${c}`); });

  return claim;
}

function clauseOverlapsBrief(clause: string, brief: Set<string>): boolean {
  if (!clause || brief.size === 0) return false;
  const lc = clause.toLowerCase();
  let hits = 0;
  for (const tok of brief) {
    if (tok.startsWith('lex:')) {
      if (lc.includes(tok.slice(4))) hits += 1;
    } else if (tok.startsWith('evt:')) {
      if (lc.includes(tok.slice(4))) return true; // any named-event echo = overlap
    } else {
      if (lc.includes(tok)) hits += 1;
    }
    if (hits >= 2) return true;
  }
  return false;
}

function strategicAnchorClause(
  req: PlanRequest,
  ceo: CeoRealityTag[],
  slotAnchorCategoryId: string | null,
): string | null {
  if (ceo.includes('public_holiday') || ceo.includes('personal_pto')) {
    return 'Holiday today — light touch.';
  }
  if (ceo.includes('circadian_travel')) return 'Travel debt is active.';
  // Anchor leakage guard: the `board_outcome` CEO flag is plan-scoped.
  // Only emit the board-level anchor when THIS slot is itself anchored to
  // a board-level event (Category A). Otherwise this clause bleeds onto
  // unrelated slots ("Ground Shukrita feedback" reading "…board-level call").
  if (ceo.includes('board_outcome') && slotAnchorCategoryId === 'A') {
    return 'Today protects Executive Presence for a board-level call.';
  }
  if (ceo.includes('veto_risk')) return 'You feel sharp; the body reads otherwise.';
  if (ceo.includes('personal_friction')) return 'Internal Buffer is compressed.';
  const growth = (req.coachInsights || []).find((i: any) => i.type === 'growth_area')?.content;
  if (growth) return `Aligned to your work on ${String(growth).toLowerCase()}.`;
  const tagLabels: Record<string, string> = {
    regulation_composure: 'composure under pressure',
    regulation_early: 'early regulation',
    recovery_resilience: 'recovery and resilience',
    energy_endurance: 'energy and endurance',
    focus_clarity: 'focus and clarity',
    mindset_reframe: 'mindset reframing',
  };
  if (req.practicePriorityTag && tagLabels[req.practicePriorityTag]) {
    return `Your long-term focus is ${tagLabels[req.practicePriorityTag]}.`;
  }
  return null;
}

function tacticalClause(req: PlanRequest, shared: SharedContext, hrvCorrelations: any, ceo: CeoRealityTag[]): string | null {
  if (ceo.includes('post_peak_hangover')) return "Yesterday's peak left a recovery gap.";
  const pat = (req as any).patternInsight;
  if (pat?.count >= 3 && pat.state) return `${pat.count} ${pat.state} days running.`;
  if (hrvCorrelations) {
    const top = Object.entries(hrvCorrelations).find(([, c]: any) => c?.count >= 2 && Math.abs(c.avgHRVDeviation) >= 10);
    if (top) {
      const [evtType, c]: any = top;
      const dir = c.avgHRVDeviation < 0 ? 'drops' : 'lifts';
      return `Your HRV ${dir} ~${Math.abs(Math.round(c.avgHRVDeviation))}% before ${evtType}.`;
    }
  }
  const trend: any = (shared as any)?.innerReadinessPattern;
  if (trend?.trend === 'declining') return 'State has been trending down this week.';
  return null;
}

function immediateClause(
  req: PlanRequest,
  ceo: CeoRealityTag[],
  slotAnchorCategoryId: string | null,
  opts: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | null;
    windowSignals?: ReturnType<typeof derivePlanWindowSignals> | null;
    slotKind?: string | null;
    phase?: 'pre' | 'during' | 'post' | null;
    practiceIsMindsetPause?: boolean;
    hasHrvEventCorrelation?: boolean;
  } = {},
): string | null {
  const ws = opts.windowSignals ?? null;
  const tod = opts.timeOfDay ?? null;

  // ── Sprint E — window-signal clauses.
  // Ordering matters: the most specific / most actionable clause wins.
  // Mindset.pause branches (state, Cat-A/pre, post-event) come first
  // because they carry the strongest tactical framing.
  if (opts.practiceIsMindsetPause) {
    if (slotAnchorCategoryId === 'A' && opts.phase === 'pre') {
      return opts.hasHrvEventCorrelation
        ? 'Past board-style events have pushed recovery off baseline — clear the reactive noise before the room.'
        : 'High-stakes call ahead — detach from the prior block and enter with a clear head.';
    }
    if (opts.phase === 'post') {
      return 'This moment carries emotional charge — offload the residue before it leaks into the next conversation.';
    }
    if (!slotAnchorCategoryId) {
      return 'Reactive thinking is building — pause to separate the noise from the signal before the next call.';
    }
  }
  if (tod === 'morning' && ws?.vetoRisk === true) {
    return 'Your body reads differently from how you feel — lead from the prep, not the instinct.';
  }
  if (tod === 'afternoon' && ws?.decisionLeakageRisk === true) {
    return 'Emotional drain is already showing — protect composure before the next decision.';
  }
  if (tod === 'evening' && ws?.recoveryNote === 'rest') {
    return 'Today was heavy and tomorrow opens heavy — tonight is genuine recovery.';
  }
  if (tod === 'evening' && ws?.bodyLoadElevated === true) {
    return 'Body load is elevated from the day — settle before the evening.';
  }

  // decision_leakage is anchored to a drain event in the next 24h. Only
  // surface it on slots that are themselves anchored to a calendar event
  // (i.e. JIT or fusion slots). Don't bleed it onto unrelated state slots.
  if (ceo.includes('decision_leakage') && slotAnchorCategoryId) {
    return 'Drain event ahead — protect composure.';
  }
  const w = req.wearableContext;
  // Choose whichever live signal is available; brief-anti-dup will swap if it overlaps
  if (w?.hasData) {
    if (w.sleepScore !== null && w.sleepScore < 65) return `Sleep ran short (${w.sleepScore}).`;
    if (w.hrvDeviation !== null && w.hrvDeviation < -10) return `HRV is ${Math.abs(Math.round(w.hrvDeviation))}% below your baseline.`;
    if (w.restingHR !== null && w.restingHR > 0) return `Resting HR is elevated.`;
  }
  if ((req.clarityLevel ?? 5) <= 2) return 'Clarity is low this morning.';
  if ((req.confidenceLevel ?? 5) <= 2) return 'Confidence is reading low.';
  if (req.calendarEvents && req.calendarEvents.length >= 5) return 'Calendar is dense today.';
  return null;
}

function pickActionVerb(primaryType: string): string {
  switch (primaryType) {
    case 'regulate': return 'Settle the system';
    case 'align': return 'Sharpen focus';
    case 'prepare': return 'Pre-frame the moment';
    case 'integrate': return 'Close cleanly';
    default: return 'Hold the base';
  }
}

function composeWhyLine(
  hm: HorizonModule,
  req: PlanRequest,
  shared: SharedContext,
  hrvCorrelations: any,
  ceo: CeoRealityTag[],
  briefClaim: Set<string>,
  fusionEventTitle: string | null,
  opts: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | null;
    windowSignals?: ReturnType<typeof derivePlanWindowSignals> | null;
  } = {},
): string {
  // Slot-scoped anchor identity. composeWhyLine MUST only emit clauses
  // that belong to the slot's own anchor — global plan-scope CEO flags
  // are passed through `strategicAnchorClause` with the slot's category
  // so cross-event leakage is impossible.
  const anchorEventFromId = (hm as any).anchorEventId
    ? (req.calendarEvents || []).find((e: any) => String(e?.id || '') === String((hm as any).anchorEventId))
    : null;
  const persistedAnchorTitle = ((hm as any).anchorEventTitle || anchorEventFromId?.title || null) as string | null;
  const slotAnchorTitle = (hm.isJit && hm.jitEventTitle)
    ? hm.jitEventTitle
    : (persistedAnchorTitle || fusionEventTitle || null);
  const slotAnchorCategoryId: string | null = (hm as any).anchorCategoryId
    ?? ((hm as any).jitCategoryId ?? null);

  // Mindset.pause detection off the selected practice's metadata.
  const p = (hm as any).practice ?? null;
  const practiceIsMindsetPause =
    !!p &&
    String(p.protocol_type || '').toLowerCase() === 'mindset' &&
    String(p.category || '').toLowerCase() === 'pause';
  const corr = hrvCorrelations?.eventToHrv || hrvCorrelations?.hrvEventCorrelation || null;
  const hasHrvEventCorrelation =
    !!corr && typeof corr.avgHrvDelta === 'number' && Math.abs(corr.avgHrvDelta) >= 10 && (corr.occurrences ?? 0) >= 3;

  let strat = strategicAnchorClause(req, ceo, slotAnchorCategoryId);
  let tac = tacticalClause(req, shared, hrvCorrelations, ceo);
  let imm = immediateClause(req, ceo, slotAnchorCategoryId, {
    timeOfDay: opts.timeOfDay ?? null,
    windowSignals: opts.windowSignals ?? null,
    slotKind: hm.slotKind ?? null,
    phase: ((hm as any).jitPhase as 'pre' | 'during' | 'post' | null) ?? null,
    practiceIsMindsetPause,
    hasHrvEventCorrelation,
  });

  if (strat && clauseOverlapsBrief(strat, briefClaim)) strat = null;
  if (tac && clauseOverlapsBrief(tac, briefClaim)) tac = null;
  if (imm && clauseOverlapsBrief(imm, briefClaim)) imm = null;

  // Bridge mode if everything overlaps
  const allOverlap = !strat && !tac && !imm && briefClaim.size > 0;
  const verb = pickActionVerb(hm.practice?.type || 'regulate');

  // Arc label — surfaced both in the Why string and on the client badge.
  // pre → Prepare, during → During, post → Recover, end_of_day → Recover,
  // start_of_day → Prepare, fallback → Steady.
  const phase = (hm as any).jitPhase as ('pre' | 'during' | 'post' | undefined);
  const arcLabel: 'Prepare' | 'During' | 'Recover' | 'Steady' =
    phase === 'post' || hm.slotKind === 'end_of_day' ? 'Recover'
    : phase === 'during' ? 'During'
    : phase === 'pre' || hm.slotKind === 'jit' || hm.slotKind === 'start_of_day' ? 'Prepare'
    : 'Steady';
  (hm as any).arcLabel = arcLabel;
  const eventSpecificWhy = buildModuleEventWhyLine(
    hm,
    slotAnchorTitle,
    slotAnchorCategoryId,
    phase,
    '',
  );

  // forContext — slot-scoped anchor only. Never name a different event.
  let forContext = '';
  if (slotAnchorTitle) {
    forContext = phase === 'post'
      ? `after ${slotAnchorTitle}`
      : phase === 'during'
        ? `through ${slotAnchorTitle}`
        : `before ${slotAnchorTitle}`;
  } else if (hm.slotKind === 'end_of_day') {
    forContext = 'to close the day with intention';
  } else if (hm.slotKind === 'start_of_day') {
    forContext = 'to set the day';
  } else {
    forContext = 'for what the day is asking of you';
  }

  const parts: string[] = [];
  if (eventSpecificWhy) {
    parts.push(eventSpecificWhy);
  } else if (allOverlap) {
    parts.push('Following your brief:');
  } else {
    if (strat) parts.push(strat);
    if (tac) parts.push(tac);
    if (imm) parts.push(imm);
  }
  parts.push(`${arcLabel}: ${verb} ${forContext}.`);
  return stripBriefMarkdown(parts.join(' ').replace(/\s+/g, ' ').trim());
}

const STEP_RATIONALE_MAP: Record<string, [string, string]> = {
  'regulate->align': ['Ground first.', 'Then sharpen.'],
  'regulate->prepare': ['Settle body.', 'Then prep mind.'],
  'regulate->integrate': ['Settle first.', 'Then close out.'],
  'align->integrate': ['Sharpen now.', 'Then consolidate.'],
  'align->prepare': ['Sharpen first.', 'Then pre-frame.'],
  'prepare->integrate': ['Pre-frame.', 'Then consolidate.'],
  'regulate->regulate': ['Reset the body.', 'Deepen the calm.'],
};

function buildStepRationale(types: string[]): string[] | undefined {
  if (!types || types.length < 2) return undefined;
  const key = `${types[0]}->${types[1]}`;
  const pair = STEP_RATIONALE_MAP[key];
  if (!pair) return undefined;
  if (types.length === 2) return pair;
  // 3-step: append third
  return [pair[0], pair[1], 'Then land it.'];
}

function detectMorningFusionEvent(req: PlanRequest, ceo: CeoRealityTag[]): string | null {
  if (!ceo.includes('board_outcome')) return null;
  const hour = new Date().getHours();
  if (hour > 11) return null;
  const events = req.calendarEvents || [];
  for (const e of events) {
    const minsUntil = (new Date(e.startTime).getTime() - Date.now()) / 60000;
    if (minsUntil >= 0 && minsUntil <= 240 && isHighStakesTitle(e.title)) {
      return e.title;
    }
  }
  return null;
}

/**
 * Apply v5.1 enrichment in-place to the final modules.
 * - Tags slotKind (start_of_day / jit / end_of_day / state-management)
 * - Recomposes whyLine with 3-tier + brief-anti-dup + CEO realities
 * - Adds stepRationale[]
 * - Replaces each practice's `reasoning` with its stepRationale (the
 *   user-visible context line on step cards) when available.
 * Practice titles never change.
 */
async function applyV51Enrichment(
  modules: HorizonModule[],
  req: PlanRequest,
  shared: SharedContext,
  hrvCorrelations: any,
  outerReadinessCache: any,
  timeOfDay: string,
): Promise<HorizonModule[]> {
  const ceo = detectCeoRealities(req, shared);
  const briefClaim = buildBriefClaimSet(outerReadinessCache, req);
  const fusionEvent = detectMorningFusionEvent(req, ceo);

  // Sprint E — reuse the Sprint D window signal derivation. Same object
  // is threaded into both the deterministic composeWhyLine path and the
  // Why LLM input below, so both surfaces read the same signal shape.
  const timeOfDayForWhy = (timeOfDay === 'morning' || timeOfDay === 'afternoon' || timeOfDay === 'evening')
    ? timeOfDay as 'morning' | 'afternoon' | 'evening'
    : null;
  const whyWindowSignals = timeOfDayForWhy ? derivePlanWindowSignals(req, timeOfDayForWhy) : null;
  if (whyWindowSignals) {
    console.log('[Plan][why-window-signals]', {
      timeOfDay: timeOfDayForWhy,
      keys: Object.entries(whyWindowSignals)
        .filter(([, v]) => v !== null && v !== undefined && v !== false)
        .map(([k]) => k),
    });
  }

  // Pre-compute today's local date for tomorrow detection.
  const tzOffsetMin = typeof req.timezoneOffset === 'number' ? req.timezoneOffset : 0;
  const nowLocal = new Date(Date.now() - tzOffsetMin * 60_000);
  const todayKey = nowLocal.toISOString().slice(0, 10);

  // Build a fast event lookup by title for category/phase derivation.
  const eventByTitle = new Map<string, any>();
  for (const e of (req.calendarEvents || [])) {
    const t = String(e?.title || '').toLowerCase().trim();
    if (t && !eventByTitle.has(t)) eventByTitle.set(t, e);
  }

  // Phase 1 (sync): slot tagging, deterministic title + sub-line, fallback Why.
  type JitJob = { idx: number; input: WhyLLMInput };
  const jitJobs: JitJob[] = [];
  const fallbackWhyLineByIndex = new Map<number, string>();

  modules.forEach((hm, idx) => {
    // Slot purpose tagging
    if (hm.isJit) hm.slotKind = 'jit';
    else if (idx === 0 && timeOfDay === 'morning') hm.slotKind = 'start_of_day';
    else if (timeOfDay === 'evening' || idx === 2) hm.slotKind = 'end_of_day';
    else hm.slotKind = 'state-management';

    hm.ceoRealities = ceo;

    // Compose Why — deterministic baseline (always set, LLM will overwrite on success)
    const fusion = idx === 0 && fusionEvent && hm.slotKind === 'start_of_day' ? fusionEvent : null;
    let fallbackWhyLine = composeWhyLine(hm, req, shared, hrvCorrelations, ceo, briefClaim, fusion, {
      timeOfDay: timeOfDayForWhy,
      windowSignals: whyWindowSignals,
    });
    // Sprint E — deterministic valence guard. Reuse the existing
    // validateWhyLine so the deterministic path cannot violate the same
    // band discipline as the LLM output. On rejection, recompose without
    // window-signal clauses (the safer generic deterministic line).
    const detBand: StateBand | null = tierToStateBand(req.innerReadinessTier);
    const detSlotAnchor: SlotAnchor = {
      eventTitle: ((hm as any).anchorEventTitle ?? hm.jitEventTitle ?? null),
      categoryId: ((hm as any).anchorCategoryId ?? (hm as any).jitCategoryId ?? null) as EventCategoryId | null,
      phase: ((hm as any).jitPhase as Phase) ?? 'pre',
    };
    const detVerdict = validateWhyLine({
      text: fallbackWhyLine,
      stateBand: detBand,
      slotAnchor: detSlotAnchor,
    });
    if (!detVerdict.ok && (detVerdict.reason === 'valence_firing_recovery' || detVerdict.reason === 'valence_depleted_push')) {
      console.log(
        `[why-llm.telemetry] idx=${idx} band=${detBand} bandSource=deterministic fallback=deterministic_repair reject=${detVerdict.reason}`,
      );
      fallbackWhyLine = composeWhyLine(hm, req, shared, hrvCorrelations, ceo, briefClaim, fusion, {
        timeOfDay: timeOfDayForWhy,
        windowSignals: null,
      });
    }
    if (fallbackWhyLine && fallbackWhyLine.length >= 12) {
      fallbackWhyLineByIndex.set(idx, fallbackWhyLine);
    }

    // Shared sub-line contract for any anchored slot, not just explicit JIT.
    // If we persisted anchor metadata on the slot, use the shared event-phase
    // frame first and only fall back to the older local phrasing when there is
    // no canonical anchor context available.
    if (hm.anchorCategoryId) {
      const anchoredFrame = buildActionFrame(
        hm.anchorCategoryId,
        (hm.jitPhase as Phase) || null,
      );
      if (anchoredFrame) hm.recommendedAction = anchoredFrame;
    }

    // ── Today's-3 v2: per-JIT-priority title, sub-line, LLM Why ──
    if (hm.isJit && hm.jitEventTitle) {
      const evtMatch = eventByTitle.get(String(hm.jitEventTitle).toLowerCase().trim());
      const subtype = classifyEvent(hm.jitEventTitle);
      // ── Shadow-run classifier v2 (diagnostic only; v1 still drives logic) ──
      shadowClassifyAndLog({
        userId: req.userId,
        eventId: (evtMatch?.id ?? (hm as any).anchorEventId ?? null) as string | null,
        title: hm.jitEventTitle,
        isOrganizer: Boolean(evtMatch?.is_organizer ?? evtMatch?.isOrganizer ?? false),
        eventMetadata: (evtMatch?.event_metadata ?? evtMatch?.eventMetadata ?? null) as Record<string, unknown> | null,
      });
      const category = (subtype?.categoryId ?? null) as EventCategoryId | null;
      const phase: Phase = (hm.jitPhase as Phase) || 'pre';

      // Tomorrow detection from event start vs local today
      let isTomorrow = false;
      try {
        const startIso = evtMatch?.startTime || evtMatch?.start_time || null;
        if (startIso) {
          const startLocal = new Date(new Date(startIso).getTime() - tzOffsetMin * 60_000);
          isTomorrow = startLocal.toISOString().slice(0, 10) !== todayKey;
        }
      } catch { /* keep false */ }

      // Title — CEO-behaviour-first via buildPriorityTitle.
      // Output shape: "<verb> <executive objective> <connector> <event>"
      // (e.g. "Lead strategic clarity in tomorrow's Board Meeting").
      // Build a single SlotAnchor object — same identity handed to the Why
      // LLM below so title + why-line cannot drift to different events.
      const slotAnchor: SlotAnchor = {
        eventTitle: hm.jitEventTitle ?? null,
        categoryId: category,
        phase,
      };
      const newTitle = buildPriorityTitle({
        slotAnchor,
        isTomorrow,
        practicePriorityTag: req.practicePriorityTag ?? null,
      });
      if (newTitle) hm.timeLabel = newTitle;
      // Stash arc verb so the client can render the chip without re-deriving.
      (hm as any).arcVerb = verbForCategoryPhase(category, phase);

      // Sub-line (≤6 words) → rendered as recommendedAction
      const frame = buildActionFrame(category, phase);
      if (frame) hm.recommendedAction = frame;

      // Queue LLM Why
      if (category) {
        const role = phase === 'post' ? 'PREVENT' : 'PREPARE';
        const w = req.wearableContext;
        const corr = hrvCorrelations?.eventToHrv || hrvCorrelations?.hrvEventCorrelation || null;
        const patternSummary = corr && corr.eventType && typeof corr.avgHrvDelta === 'number' && corr.occurrences >= 3
          ? `HRV ${corr.avgHrvDelta > 0 ? 'rises' : 'drops'} ~${Math.abs(Math.round(corr.avgHrvDelta))}% around ${corr.eventType} (n=${corr.occurrences})`
          : null;
        // Shared state band — read directly off the same brief snapshot that
        // drives the MRS dial. NEVER re-banded; falls through to null when
        // the snapshot is missing.
        const stateBand: StateBand | null = tierToStateBand(req.innerReadinessTier);
        const arcPosition: ArcPosition = arcPositionFromPhase(phase);
        const evtStartIso = evtMatch?.startTime || evtMatch?.start_time || null;
        const evtStartMs = evtStartIso ? new Date(evtStartIso).getTime() : null;
        const practiceTitle = hm.practice?.title
          ?? (Array.isArray(hm.practices) && hm.practices[0]?.title)
          ?? null;
        const protocolCombo = Array.isArray(hm.practices) && hm.practices.length > 1
          ? hm.practices.map((p: any) => p?.type).filter(Boolean).join(' → ')
          : (hm.practice?.type ?? null);
        const input: WhyLLMInput = {
          role,
          eventName: hm.jitEventTitle,
          category,
          phase,
          minutesUntilStart: hm.jitMinutesUntil ?? null,
          hrvDeltaPct: (w?.hasData && typeof w.hrvDeviation === 'number') ? Math.round(w.hrvDeviation) : null,
          sleepScore: (w?.hasData && typeof w.sleepScore === 'number') ? w.sleepScore : null,
          rhrTrend: (w?.hasData && typeof w.restingHR === 'number' && w.restingHR > 0) ? 'elevated' : null,
          travelDebtActive: ceo.includes('circadian_travel') ? true : null,
          stressLoad: null,
          burnoutRisk: null,
          mindState: typeof req.clarityLevel === 'number' && req.clarityLevel > 0 ? req.clarityLevel : null,
          bodyState: typeof req.confidenceLevel === 'number' && req.confidenceLevel > 0 ? req.confidenceLevel : null,
          patternSummary,
          growthIntention: (req as any).growthIntention || null,
          // Brief↔Plan parity advisories — append the SAME blocks the Brief's
          // LLM saw, so the "Why this matters" line stays anchored to the
          // identical CEO behaviours and pillar focus the Brief already named
          // to the user. Both blocks come straight off the shared snapshot
          // (`shared.briefBehaviour`) — no re-evaluation, no fallback copy.
          ceoBehaviourBlock: shared.briefBehaviour?.promptBlockPlan
            ?? shared.briefBehaviour?.promptBlockBrief
            ?? null,
          eventTaxonomyBlock: shared.briefBehaviour?.taxonomyBlock ?? null,
          briefEcho: shared.briefBehaviour?.promptBlockBrief
            ?? shared.briefBehaviour?.promptBlockPlan
            ?? null,
          // Shared band + slot identity for the new Why-line contract.
          stateBand,
          arcPosition,
          slotAnchor,
          practiceTitle,
          protocolCombo,
          timezoneOffsetMinutes: typeof req.timezoneOffset === 'number' ? req.timezoneOffset : 0,
          eventStartMs: evtStartMs,
          // Sprint E — same window signals used by the deterministic path
          // (Sprint D derivation). Only true / non-null keys reach the
          // prompt; helper drops the rest.
          decisionLeakageRisk: whyWindowSignals?.decisionLeakageRisk === true ? true : undefined,
          bodyLoadElevated: whyWindowSignals?.bodyLoadElevated === true ? true : undefined,
          recoveryNote: whyWindowSignals?.recoveryNote ?? null,
          // vetoRisk is not safely derivable from the current PlanRequest
          // (no body/subjective divergence field on `req`). Left undefined
          // so the prompt drops it rather than fabricates a signal.
          vetoRisk: undefined,
          // Phase 3 — Leader voice rules (null-safe; prompt omits the
          // block when unavailable). Same rules injected into the Brief.
          leaderVoiceRules: (req as any).leaderProfile?.voice?.cos_brief_rules ?? null,
        };
        jitJobs.push({ idx, input });
      }
    }

    // Step rationale (2–4 words) per practice
    const types = (hm.practices || [hm.practice]).map((p: any) => p?.type).filter(Boolean);
    const rationale = buildStepRationale(types);
    if (rationale) {
      hm.stepRationale = rationale;
      // Replace the user-visible context line on each step card
      (hm.practices || []).forEach((p: any, i: number) => {
        if (rationale[i]) p.reasoning = rationale[i];
      });
      if (hm.practice && rationale[0]) hm.practice.reasoning = rationale[0];
    }
  });

  // Phase 2 (parallel LLM): per-JIT-priority Why statements.
  if (jitJobs.length > 0) {
    const accepted: { idx: number; text: string; slotAnchor: SlotAnchor | null; arcPosition: ArcPosition | null }[] = [];
    const todaysOtherWhyLines: string[] = [];
    for (let i = 0; i < jitJobs.length; i++) {
      const job = jitJobs[i];
      const inp = job.input;
      inp.todaysOtherWhyLines = [...todaysOtherWhyLines];
      const text = await generateWhyStatement(inp);
      const slotAnchor = inp.slotAnchor ?? null;
      const arcPosition = inp.arcPosition ?? null;
      const bandUsed = inp.stateBand ?? null;
      const bandSource = bandUsed ? 'shared_brief_behaviour' : 'missing';
      if (!text || text.split(/\s+/).length < 5) {
        console.log(
          `[why-llm.telemetry] idx=${job.idx} band=${bandUsed} bandSource=${bandSource} arc=${arcPosition} fallback=deterministic_repair reject=empty`,
        );
        continue;
      }
      const sameDayDuplicate = todaysOtherWhyLines.some((prior) => jaccard(prior, text) > 0.8);
      if (sameDayDuplicate) {
        console.log(
          `[why-llm.telemetry] idx=${job.idx} band=${bandUsed} bandSource=${bandSource} arc=${arcPosition} fallback=deterministic_repair reject=same_day_duplicate`,
        );
        continue;
      }
      const verdict = validateWhyLine({
        text,
        stateBand: bandUsed,
        slotAnchor,
        priorAccepted: accepted.map((a) => ({ text: a.text, slotAnchor: a.slotAnchor, arcPosition: a.arcPosition })),
        sameDayAccepted: todaysOtherWhyLines.map((line) => ({ text: line })),
        arcPosition,
      });
      if (!verdict.ok) {
        console.log(
          `[why-llm.telemetry] idx=${job.idx} band=${bandUsed} bandSource=${bandSource} arc=${arcPosition} fallback=deterministic_repair reject=${verdict.reason}`,
        );
        continue;
      }
      console.log(
        `[why-llm.telemetry] idx=${job.idx} band=${bandUsed} bandSource=${bandSource} arc=${arcPosition} fallback=llm_accepted anchorTokens=${verdict.anchorTokensUsed}`,
      );
      accepted.push({ idx: job.idx, text, slotAnchor, arcPosition });
      todaysOtherWhyLines.push(text);
    }
    for (const a of accepted) modules[a.idx].whyLine = stripBriefMarkdown(a.text);
  }

  // Final event-awareness guard. The per-JIT LLM can overwrite the deterministic
  // Why, so repair repeated/generic anchored-card copy after all enrichment.
  const acceptedWhyLines: string[] = [];
  for (const hm of modules) {
    const anchorEventFromId = (hm as any).anchorEventId
      ? (req.calendarEvents || []).find((e: any) => String(e?.id || '') === String((hm as any).anchorEventId))
      : null;
    const eventTitle = (hm.isJit && hm.jitEventTitle)
      ? hm.jitEventTitle
      : (((hm as any).anchorEventTitle || anchorEventFromId?.title || null) as string | null);
    const categoryId = ((hm as any).anchorCategoryId ?? (hm as any).jitCategoryId ?? null) as string | null;
    const phase = (hm as any).jitPhase as ('pre' | 'during' | 'post' | undefined);
    const eventWhy = buildModuleEventWhyLine(hm, eventTitle, categoryId, phase, '');
    const why = String(hm.whyLine || '');
    const isRepeated = acceptedWhyLines.some((prior) => jaccard(prior, why) > 0.78);
    const isGeneric = /\b(following your brief|for your state|demands today|carry your edge|set your state|what the day is asking)\b/i.test(why);
    if (eventWhy && (isRepeated || isGeneric)) {
      hm.whyLine = eventWhy;
    } else if (!hm.whyLine && fallbackWhyLineByIndex.has(modules.indexOf(hm))) {
      hm.whyLine = fallbackWhyLineByIndex.get(modules.indexOf(hm)) || hm.whyLine;
    }
    if (hm.whyLine) acceptedWhyLines.push(String(hm.whyLine));
  }

  // ── Temporal gate: Reflection Corner / "Tiny Win" practices ─────────
  // The "Tiny Win and Reflection" integrate practice asks the user to
  // capture "one thing you did right today". Only emit between 18:00 and
  // 22:59 local. In the Early Hours tail of the Evening window (00–04:59)
  // — when the day has effectively reset — swap to a forward-looking
  // "Sleep prep & tomorrow framing" integrate so the prompt matches
  // human perception of the moment.
  const localHour = (() => {
    const local = new Date(Date.now() - tzOffsetMin * 60_000);
    return local.getUTCHours();
  })();
  const reflectionWindow = localHour >= 18 && localHour < 23;
  if (!reflectionWindow) {
    for (const hm of modules) {
      const practices = (hm.practices && hm.practices.length > 0)
        ? hm.practices
        : (hm.practice ? [hm.practice] : []);
      for (const p of practices) {
        if (!p) continue;
        if (p.title === 'Tiny Win and Reflection' || p.type === 'integrate') {
          if (p.title === 'Tiny Win and Reflection') {
            p.title = 'Sleep Prep & Tomorrow Framing';
            (p as any).prompt = "Two lines, both forward-looking: what is the ONE thing tomorrow needs you ready for, and the cleanest way to land tonight so you arrive there sharp?";
          }
        }
      }
    }
  }

  // ── Final sanitiser pass ────────────────────────────────────────────
  // Strip stray markdown emphasis from any user-visible string the LLM
  // (or a downstream copy builder) may have touched. whyLine is already
  // stripped on the determ. baseline path; this catches the LLM path and
  // the recommendedAction copy builder.
  for (const hm of modules) {
    if (typeof hm.whyLine === 'string') hm.whyLine = stripBriefMarkdown(hm.whyLine);
    if (typeof hm.recommendedAction === 'string') hm.recommendedAction = stripBriefMarkdown(hm.recommendedAction);
    if (typeof hm.timeLabel === 'string') hm.timeLabel = stripBriefMarkdown(hm.timeLabel);
  }

  return modules;
}

/**
 * Builds a short, plain-English benefit line shown above the practice cards
 * on the Plan page (e.g. "Enter optimal flow state ahead of Cambridge Interview",
 * "Build resilience for high-demand days"). Deterministic — no LLM.
 * Companion to whyLine: whyLine = "why now", recommendedAction = "what this does for you".
 */
function buildRecommendedAction(
  primaryType: 'regulate' | 'align' | 'prepare' | 'integrate' | string,
  ctx: SlotContextInput
): string {
  return buildRecommendedActionCopy({
    primaryType,
    eventTitle: ctx.eventTitle,
    timeOfDay: ctx.timeOfDay,
    tier: ctx.tier,
  });
}

function buildHorizonModules(
  todModules: any[],
  preEventPlan: any,
  topEvent: any,
  req: PlanRequest,
  shared: SharedContext,
  hrvCorrelations: any,
  timeOfDay: string,
  todCoachCard: any,
  enrichedContent: any[],
  pendingCommitments: any[],
  outerReadinessCache?: any,
  jitRankedCandidates: RankedJitCandidate[] = [],
): HorizonModule[] {
  const hasJitEvent = !!preEventPlan;
  const jitMinutesUntil = preEventPlan?.minutesUntil ?? null;
  const jitEventTitle = preEventPlan?.eventTitle ?? null;

  const pattern = determineAllocationPattern(
    req.innerReadinessTier, req.calendarLoad, hasJitEvent, jitMinutesUntil
  );

  // Derive signals for context
  const frictionTrend = shared.innerReadinessPattern.trend === 'declining' ? 'declining' : null;
  const scoreTrend = shared.innerReadinessPattern.trend === 'declining' ? 'declining' : null;
  const pendingCommitment = pendingCommitments.length > 0 ? pendingCommitments[0].commitment_text : null;
  const coachGrowthArea = (req.coachInsights || []).find((i: any) => i.type === 'growth_area')?.content || null;
  const archetypeWatchFor = ARCHETYPE_WATCH_FOR[req.archetype] || null;

  const checkInCountTotal = shared.innerReadinessPattern.values?.length || 0;
  const wearableDaysConnected = req.wearableContext?.hasData ? 7 : 0;
  const meetingCount = req.calendarEvents?.length || 0;
  const dayNames2 = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayOfWeekName = dayNames2[new Date().getDay()];

  // Brief relay signals
  const briefPhrase = outerReadinessCache?.phrase || req.outerReadinessPhrase || null;
  const briefBody = outerReadinessCache?.context || req.outerReadinessContext || null;
  const briefLeanOn = outerReadinessCache?.leanOn || req.outerReadinessLeanOn || null;
  const briefWatchFor = outerReadinessCache?.watchFor || req.outerReadinessWatchFor || null;

  // Common context input builder.
  // Pass 4 — accept optional `anchor` so state/filler slots can thread the
  // resolved event anchor (title / categoryId / phase) into the why-line.
  // For JIT slots, eventTitle still carries the JIT title; this anchor arg
  // is intended for non-JIT state and filler branches.
  const makeCtxInput = (
    horizon: 'immediate' | 'tactical' | 'strategic',
    isJit: boolean,
    practiceTypes?: string[],
    anchor?: { title: string | null; categoryId: string | null; phase: 'pre' | 'during' | 'post' | null } | null,
  ): SlotContextInput => ({
    horizon, isJit, eventTitle: anchor?.title ?? jitEventTitle, jitMinutesUntil,
    tier: req.innerReadinessTier, divergenceMode, checkInOutcome: req.checkInOutcome,
    hrvEventCorrelation, patternInsight: req.patternInsight || null,
    frictionTrend, scoreTrend, pendingCommitment, coachGrowthArea,
    practicePriorityTag: req.practicePriorityTag || null, archetypeWatchFor,
    checkInCountTotal, wearableDaysConnected, calendarLoad: req.calendarLoad,
    meetingCount, clarityLevel: req.clarityLevel, confidenceLevel: req.confidenceLevel,
    timeOfDay, dayOfWeek: dayOfWeekName,
    briefPhrase, briefBody, briefLeanOn, briefWatchFor,
    practiceTypes,
    anchorTitle: anchor?.title ?? null,
    anchorCategoryId: anchor?.categoryId ?? null,
    anchorPhase: anchor?.phase ?? null,
  });

  // Divergence mode detection
  let divergenceMode: string | null = null;
  if (req.wearableContext?.hasData && req.wearableContext.hrvDeviation !== null) {
    if (req.wearableContext.hrvDeviation < -15 && req.innerReadinessTier !== 'depleted') {
      divergenceMode = 'MASKED_HIGH';
    }
  }

  // HRV correlation for today's first event type
  let hrvEventCorrelation: { eventType: string; avgHrvDelta: number; occurrences: number } | null = null;
  if (hrvCorrelations && topEvent) {
    const evtType = topEvent.hrvCorrelation?.eventType;
    if (evtType && hrvCorrelations[evtType]) {
      const c = hrvCorrelations[evtType];
      hrvEventCorrelation = { eventType: evtType, avgHrvDelta: c.avgHRVDeviation, occurrences: c.count };
    }
  }

  const firstEventTitle = req.calendarEvents?.[0]?.title?.split(' ').slice(0, 4).join(' ') || null;
  const timeOfDayLabel = timeOfDay === 'morning' ? 'This morning' : timeOfDay === 'afternoon' ? 'Right now' : 'This evening';
  const labels: Record<string, string> = { regulate: 'REGULATE', align: 'ALIGN', prepare: 'PREPARE', integrate: 'INTEGRATE' };
  const protocols: Record<string, string> = { regulate: 'Somatic Protocol', align: 'Mindset Protocol', prepare: 'Mind Performance Coach', integrate: 'Mind Performance Coach' };

  // ── §4 Pre/During/Post phase-aware JIT label resolver ────────────────
  // Given the JIT topEvent + current time, returns the correct slot label
  // contract:
  //   pre    → "Prepare ahead of <Event>"
  //   during → "Stay regulated through <Event>"  (skipped for category F —
  //            EVENT_CATEGORIES.F.protocol.duringNotificationOnly = true)
  //   post   → "Recover after <Event>" / "Reset after <Event>" (high-stakes
  //            A/D use "Reset" per §3 selfRegulationFocus emphasis on
  //            discharging stage chemistry / emotional residue)
  // The resolved ComboKey from event-phase-map.ts is returned alongside so
  // downstream practice selection can prefer matching practices (TODO wiring
  // into module mapping — see follow-up plan §5).
  const resolveJitPhaseLabel = (
    eventTitle: string | null | undefined,
    eventStartMs: number | null,
    eventEndMs: number | null,
    nowMs: number,
  ): { phase: Phase; label: string; combo: ComboKey | null; categoryId: EventCategoryId | null; leadTimeMin: number | null } => {
    const fallbackTitle = (eventTitle && eventTitle.trim()) || 'this event';
    const truncated = (eventTitle && eventTitle.trim())
      ? eventTitle.trim().split(/\s+/).slice(0, 5).join(' ')
      : fallbackTitle;
    const enriched = enrichEvent({ title: eventTitle ?? '' });
    const subtype = enriched.subtype;
    const categoryId = enriched.categoryId;
    const category = enriched.category;
    const leadTimeMin = enriched.leadTimeMin;

    // Resolve phase from absolute times (the only signal we trust).
    let phase: Phase = 'pre';
    if (eventStartMs != null && eventEndMs != null) {
      if (nowMs >= eventEndMs) phase = 'post';
      else if (nowMs >= eventStartMs) phase = 'during';
      else phase = 'pre';
    } else if (eventStartMs != null && nowMs >= eventStartMs) {
      // No end time: assume 60-minute default; treat as post after that.
      phase = (nowMs - eventStartMs) > 60 * 60_000 ? 'post' : 'during';
    }

    // Category F (Conferences) — DURING is notification-only by §3 contract.
    // If we land in "during" for F, downgrade to "pre" framing so we never
    // emit a slot card the user can't action mid-keynote.
    if (phase === 'during' && category?.protocol.duringNotificationOnly) {
      phase = 'pre';
    }

    // Some categories have no During / Post phase defined (E pre-only,
    // G partial). Fall back to the closest defined phase rather than
    // emitting a nonsense label.
    if (categoryId && !EVENT_PHASE_MAP[categoryId][phase]) {
      const order: Phase[] = phase === 'post' ? ['post', 'pre', 'during']
        : phase === 'during' ? ['during', 'pre', 'post']
        : ['pre', 'during', 'post'];
      const found = order.find((p) => EVENT_PHASE_MAP[categoryId][p]);
      if (found) phase = found;
    }

    const resolved = phaseForEvent(eventTitle || '', phase);
    const combo = resolved ? (`${resolved.resolvedCombo.protocol}.${resolved.resolvedCombo.mode}` as ComboKey) : null;

    // High-stakes governance (A) and difficult people work (D) need a
    // sharper Post verb — §3 selfRegulationFocus calls out "discharge
    // residual emotional load" / "post-peak hangover". Use "Reset after".
    const isHighStakesPost = phase === 'post' && (categoryId === 'A' || categoryId === 'D');

    let label: string;
    if (phase === 'pre') {
      label = `Prepare ahead of ${truncated}`;
    } else if (phase === 'during') {
      label = `Stay regulated through ${truncated}`;
    } else {
      label = `${isHighStakesPost ? 'Reset' : 'Recover'} after ${truncated}`;
    }

    return { phase, label, combo, categoryId, leadTimeMin };
  };

  // ── State + Calendar label composer ─────────────────────────────────
  // Every non-JIT slot label MUST take the form:
  //   "<state action> ahead of <calendar anchor>"
  // It bridges the user's dominant physiological / cognitive signal to
  // the calendar pressure that makes the state matter. Never emit bare
  // time literals ("Midday reset", "Later today", "Before bed", etc.).
  const truncateTitle = (t: string | null | undefined, n = 5): string | null => {
    if (!t) return null;
    return String(t).split(/\s+/).slice(0, n).join(' ').trim() || null;
  };
  const nowMs = Date.now();
  const startOfTomorrow = new Date(); startOfTomorrow.setHours(0, 0, 0, 0); startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const endOfTomorrow = new Date(startOfTomorrow); endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
  // Day-of horizon invariant: when the user is NOT in Week-Ahead mode
  // (Sun / last-day-PTO / last-day-holiday / manual override), no event
  // whose start is more than 24h from "now" may be used as a named anchor
  // anywhere downstream. Compute the resolved decision once.
  const _planTzOffset = (req as any).timezoneOffset ?? 0;
  const _planLocalNow = new Date(nowMs - _planTzOffset * 60000);
  const _planWeekAheadDecision = evaluateWeekAheadMode({
    dayOfWeek: _planLocalNow.getUTCDay(),
    localHour: _planLocalNow.getUTCHours(),
    manualOverride: (req as any).weekAheadOverride === true,
  });
  const _planWeekAheadActive = _planWeekAheadDecision.active;
  const _dayOfHorizonCutoffMs = nowMs + DAY_OF_HORIZON_MS;
  const tomorrowEventsRaw = (req.calendarEvents || []).filter((e: any) => {
    const t = new Date(e.startTime).getTime();
    return t >= startOfTomorrow.getTime() && t < endOfTomorrow.getTime();
  });
  // Strict 24h gate on day-of: a "tomorrow" event that starts after now+24h
  // (e.g. Saturday-evening user looking at Sunday-afternoon events) must
  // NOT seed any named anchor. Week-Ahead mode keeps the full set.
  const tomorrowEvents = _planWeekAheadActive
    ? tomorrowEventsRaw
    : tomorrowEventsRaw.filter((e: any) =>
        new Date(e.startTime).getTime() <= _dayOfHorizonCutoffMs);
  const todayRemainingEvents = (req.calendarEvents || []).filter((e: any) => {
    const t = new Date(e.startTime).getTime();
    return t >= nowMs && t < startOfTomorrow.getTime();
  });
  const scoreEventStakes = (e: any): number => {
    let s = 0;
    if (e.isOrganizer) s += 2;
    const att = e.attendeesCount || 0;
    if (att > 5) s += 2; else if (att > 2) s += 1;
    const dur = (new Date(e.endTime).getTime() - new Date(e.startTime).getTime()) / 60000;
    if (dur > 60) s += 2; else if (dur >= 30) s += 1;
    if (!e.isRecurring) s += 1;
    const title = String(e.title || '').toLowerCase();
    if (/board|investor|interview|keynote|earnings|all[- ]hands|offsite|gdst/.test(title)) s += 3;
    return s;
  };
  const tomorrowLeadEvent = [...tomorrowEvents].sort((a, b) => scoreEventStakes(b) - scoreEventStakes(a))[0] || null;
  const todayLeadEvent = [...todayRemainingEvents].sort((a, b) => scoreEventStakes(b) - scoreEventStakes(a))[0] || null;
  const isTravelTitle = (t: string | null | undefined) => isTravelTitleCanonical(t);

  // ── Pass 7 (N — Sunday / weekend / post-holiday) ──
  // Upcoming-week priority selector: highest-stakes event in the next 7 days
  // excluding today, used when the day itself has no useful anchor (Sunday,
  // personal holiday today, or first weekday back from a personal holiday).
  // Plain `tomorrowEvents` collapses to "tomorrow's load" with no name; this
  // selector promotes the named event so the slot title and why-line can
  // reference it directly.
  const endOfWeekAhead = new Date(startOfTomorrow);
  endOfWeekAhead.setDate(endOfWeekAhead.getDate() + 7);
  const upcomingWeekEvents = (req.calendarEvents || []).filter((e: any) => {
    const t = new Date(e.startTime).getTime();
    return t >= startOfTomorrow.getTime() && t < endOfWeekAhead.getTime();
  });
  const upcomingWeekLeadEvent =
    [...upcomingWeekEvents].sort((a, b) => scoreEventStakes(b) - scoreEventStakes(a))[0] || null;

  // Personal-holiday today / yesterday — canonical regex from
  // _shared/ceo-behaviour/pto-holiday.ts (same SSOT used by
  // brief-signal-coverage's personalHolidayInferred).
  const _isAllDayEvent = (e: any): boolean => {
    const s = new Date(e.startTime).getTime();
    const en = new Date(e.endTime || e.startTime).getTime();
    return (en - s) >= 20 * 3600 * 1000;
  };
  const isPersonalHolidayToday = (req.calendarEvents || []).some(
    (e: any) =>
      _isAllDayEvent(e) &&
      isPersonalHolidayTitle(String(e.title || '')) &&
      new Date(e.startTime).getTime() < startOfTomorrow.getTime() &&
      new Date(e.endTime || e.startTime).getTime() > (nowMs - 24 * 3600 * 1000),
  );
  const startOfYesterday = new Date(startOfTomorrow); startOfYesterday.setDate(startOfYesterday.getDate() - 2);
  const startOfToday = new Date(startOfTomorrow); startOfToday.setDate(startOfToday.getDate() - 1);
  const wasPersonalHolidayYesterday = (req.calendarEvents || []).some((e: any) => {
    if (!_isAllDayEvent(e)) return false;
    if (!isPersonalHolidayTitle(String(e.title || ''))) return false;
    const t = new Date(e.startTime).getTime();
    return t >= startOfYesterday.getTime() && t < startOfToday.getTime();
  });

  // ── Slot-anchor bookkeeper (variable slot count + dedup) ──
  // Each emitted slot pushes its anchor event id (null for pure
  // state/load/wearable anchors). canAnchorAgain enforces
  // CATEGORY_MAX_SLOTS so the same event can't show up in more slots
  // than its category permits (C/E/B/H = 1; A/D = 2; F/G = 3).
  const slotAnchors: { eventId: string | null; phase?: 'pre' | 'during' | 'post' | null }[] = [];
  const anchorsUsedFor = (id: string) => slotAnchors.filter(a => a.eventId === id).length;
  const canAnchorAgain = (id: string, cat: any): boolean => {
    const cap = (CATEGORY_MAX_SLOTS as any)[cat] ?? 1;
    return anchorsUsedFor(id) < cap;
  };
  const phaseAlreadyAnchored = (id: string, phase: 'pre' | 'during' | 'post') =>
    slotAnchors.some(a => a.eventId === id && a.phase === phase);
  /**
   * Phase C: walk the ranked (event, phase) candidate list and return the
   * first candidate that (a) hasn't saturated its category's slot cap and
   * (b) hasn't already been anchored with this same phase. Lets a single
   * G long-haul / F multi-day / A pre+post event legitimately occupy
   * multiple slots without re-using the same phase.
   */
  const pickNextRankedCandidate = (): RankedJitCandidate | null => {
    for (const c of jitRankedCandidates) {
      if (!c.eventId) continue;
      if (!canAnchorAgain(c.eventId, c.categoryId)) continue;
      if (phaseAlreadyAnchored(c.eventId, c.phase)) continue;
      return c;
    }
    return null;
  };
  // Phase K — `COMBO_TO_PRACTICE_TYPE` now lives in
  // `_shared/protocols/protocol-combos.ts` (single source of truth).
  // Local mirror deleted to prevent drift.
  /**
   * Phase C.2 — pick the best-matching practice(s) from a module pool for
   * the given ComboKey. Prefers exact type match; falls back to first
   * non-coach module so we never emit an empty slot.
   *
   * Phase L — adds a 7-day recency penalty: practices completed within the
   * last 7 days are de-prioritised (sorted last within their type bucket)
   * so the user sees rotation across the catalog rather than the same
   * top-of-list module every day. Recency is read from `req.recentPracticeDays`
   * (contentId → days-ago, populated from the 14-day practice_sessions query).
   */
  const selectPracticesByCombo = (
    pool: any[],
    combo: ComboKey | null,
    excludeIds: Set<string>,
    max = 2,
    slotContract: SelectionSlotContract = {},
    intentOverride: ReturnType<typeof deriveSlotIntent> | null = null,
  ): any[] => {
    const intent = intentOverride ?? deriveSlotIntent({
      stateAction: slotContract.arcLabel === 'During' ? 'Build capacity' : slotContract.arcLabel === 'Recover' ? 'Recover' : 'Steady the system',
      anchorCategory: null,
      anchorPhase: slotContract.jitPhase ?? null,
      combo,
    });
    const selected: any[] = [];
    const consumed = new Set(excludeIds);
    const recencyMap: Record<string, number> = (req as any).recentPracticeDays || {};
    const poolWithMeta = (pool || []).map((m: any) => ({
      ...m,
      masteryCategory: m.masteryCategory ?? m.mastery_category ?? null,
    }));
    // Sprint D — derive coarse window signals from data already assembled
    // upstream (no new DB queries). Missing signals stay null → no-op.
    const windowSignals = derivePlanWindowSignals(req, timeOfDay);
    if (windowSignals) {
      console.log('[Plan][practice-window-signals]', {
        timeOfDay,
        keys: Object.entries(windowSignals)
          .filter(([, v]) => v !== null && v !== undefined && v !== false)
          .map(([k]) => k),
      });
    }
    const firstPick = selectPracticeForSlot(poolWithMeta, { ...slotContract, mode: slotContract.mode ?? 'jit+state' }, intent, consumed, {
      recentPracticeDays: recencyMap,
      mrsScore: (req as any).mrsScore ?? null,
      windowSignals,
    });
    const head = firstPick.selected[0] ?? null;
    if (!head) return [];
    selected.push(head);
    consumed.add(head.contentId);
    if (max > 1) {
      const alt = findAlternate(poolWithMeta, head, intent, consumed);
      if (alt) {
        console.log(`[generate-mastery-plan] intra-day dedup: substituted ${alt.contentId} for ${head.contentId} in slot ${selected.length}`);
        selected.push(alt);
        consumed.add(alt.contentId);
      }
    }
    return selected;
  };
  const pickAnchorEvent = (candidates: any[]): any | null => {
    for (const e of candidates) {
      if (!e) continue;
      const cat = enrichEvent(e).categoryId;
      // Phase G fix: state/filler slots implicitly own the 'pre' phase
      // ("ahead of X"). Skip events whose pre-phase is already claimed by a
      // JIT slot — otherwise we duplicate the same anchor across slots.
      if (phaseAlreadyAnchored(e.id, 'pre')) continue;
      if (cat ? canAnchorAgain(e.id, cat) : anchorsUsedFor(e.id) < 1) return e;
    }
    return null;
  };

  const composeStateLabel = (
    slotIndex: 0 | 1 | 2,
  ): {
    label: string;
    eventId: string | null;
    eventTitle: string | null;
    categoryId: EventCategoryId | null;
    subtypeId: string | null;
    scenarioId: string | null;
    leadTimeMin: number | null;
    phase: 'pre' | null;
  } | null => {
    const w = req.wearableContext;
    const tier = req.innerReadinessTier;
    const checkIn = req.checkInOutcome;
    const load = req.calendarLoad;
    const pressure = req.calendarPressure;
    const tzOffset = (req as any).timezoneOffset ?? 0;
    const localNow = new Date(Date.now() - tzOffset * 60000);
    const dow = localNow.getUTCDay(); // 0 Sun .. 6 Sat
    const isWeekend = dow === 0 || dow === 6;

    // Sort candidate event lists by stakes, then pick the first one that
    // is not already saturating its category's slot cap. Slot 3 prefers
    // tomorrow's events; slots 1–2 prefer today's.
    const todaySorted = [...todayRemainingEvents].sort((a, b) => scoreEventStakes(b) - scoreEventStakes(a));
    const tomorrowSorted = [...tomorrowEvents].sort((a, b) => scoreEventStakes(b) - scoreEventStakes(a));
    const candidateList = slotIndex === 2
      ? [...tomorrowSorted, ...todaySorted]
      : [...todaySorted, ...tomorrowSorted];
    const anchorEvent = pickAnchorEvent(candidateList);
    const anchorEnriched = anchorEvent ? enrichEvent(anchorEvent) : null;
    const anchorCategory = anchorEnriched?.categoryId ?? null;
    const anchorDemand = anchorEnriched?.demandProfile ?? null;
    const anchorTitle = truncateTitle(anchorEvent?.title);
    const anchorIsTravel = isTravelTitle(anchorEvent?.title);
    const anchorIsTomorrow = !!(anchorEvent && tomorrowEvents.some((e: any) => e.id === anchorEvent.id));

    // 1) State action — pick strongest signal
    let stateAction = '';
    if (anchorCategory === 'G' || (anchorDemand && anchorDemand.cir >= 2) || anchorIsTravel) {
      stateAction = 'Re-anchor circadian rhythm';
    } else if (w?.hasData && w.hrvDeviation !== null && w.hrvDeviation < -10) {
      stateAction = 'Restore HRV';
    } else if (w?.hasData && w.sleepScore !== null && w.sleepScore < 65) {
      stateAction = 'Recover sleep debt';
    } else if (tier === 'depleted' || checkIn === 'drained' || checkIn === 'struggling') {
      const highVisibility = (anchorCategory === 'C' || anchorCategory === 'F');
      const highEmotional = !!(anchorDemand && anchorDemand.emo >= 3);
      stateAction = (highVisibility && !highEmotional) ? 'Reset stage chemistry' : 'Settle the system';
    } else if (load === 'high' || pressure === 'high') {
      stateAction = 'Decompress';
    } else if (tier === 'managing') {
      const cogDominant = !!(anchorDemand && anchorDemand.cog >= 3 && anchorDemand.emo <= 1 && anchorDemand.ene <= 1);
      // Only emit focus-bearing verbs when a real focus signal exists.
      // Without an anchor / focus signal, fall back to a neutral verb so
      // the title can't claim "focus" the user hasn't asked for.
      const focusSignal = anchorCategory === 'E' || cogDominant;
      stateAction = focusSignal
        ? (anchorCategory === 'E' ? 'Prime for focus' : 'Re-consolidate focus')
        : 'Steady the system';
    } else {
      stateAction = slotIndex === 2 ? 'Build capacity' : 'Steady the system';
    }

    // 2) Anchor phrase — Contract priority: distinct event > calendar load >
    //    wearable deficit > generic horizon. For slot 2/3 (index ≥ 1), if
    //    none of {distinct event, high load, wearable deficit, tomorrow's
    //    calendar (slot 3)} apply, return null so the resolver drops the
    //    slot rather than padding with a duplicate anchor.
    let anchor = '';
    let anchorEventId: string | null = null;
    const highLoad = load === 'high' || pressure === 'high';
    const hrvDeficit = !!(w?.hasData && w.hrvDeviation !== null && w.hrvDeviation < -10);
    const sleepDeficit = !!(w?.hasData && w.sleepScore !== null && w.sleepScore < 65);

    if (anchorEvent) {
      anchorEventId = anchorEvent.id;
      if (anchorIsTravel) {
        anchor = anchorIsTomorrow ? 'long-haul travel tomorrow' : 'long-haul travel today';
      } else {
        anchor = `${anchorIsTomorrow ? "tomorrow's" : "today's"} ${anchorTitle}`;
      }
    } else if (highLoad) {
      anchor = slotIndex === 2 ? "today's dense calendar" : "today's back-to-back load";
    } else if (hrvDeficit || sleepDeficit) {
      anchor = "tomorrow's load";
    } else if (slotIndex === 2) {
      // Pass 7: prefer the named upcoming-week priority over generic
      // "Monday's / next week's load" when present. Applies on Sunday,
      // personal-holiday today, and post-holiday weekday. Saturday is
      // intentionally excluded — it is a recovery day (Week-Ahead server
      // predicate, _shared/plan/week-ahead-mode.ts §17.2a). Promoting a
      // Monday lead event on Saturday would violate the 24h JIT rule
      // and inflate Saturday past the "1 morning slot mandatory" cadence.
      const isSundayOrPostHoliday =
        (dow === 0) || isPersonalHolidayToday || wasPersonalHolidayYesterday;
      const promoteWeekLead = upcomingWeekLeadEvent && isSundayOrPostHoliday;
      if (promoteWeekLead && upcomingWeekLeadEvent) {
        anchorEventId = upcomingWeekLeadEvent.id;
        anchor = (upcomingWeekLeadEvent.title
          ? truncateTitle(upcomingWeekLeadEvent.title)
          : null) || "this week's lead event";
      } else if (isWeekend && dow === 0) anchor = "Monday's load";
      else if (isWeekend) anchor = "next week\u2019s load";
      else if (tomorrowEvents.length > 0) anchor = "tomorrow's calendar";
      else anchor = "tomorrow's load";
    } else {
      // No event, no high load, no wearable deficit, no slot-2 specials.
      // Don't fabricate "today's load" — pick a neutral, calendar-aware
      // phrase that doesn't imply a calendar burden that isn't there.
      const localHour = localNow.getUTCHours();
      if (isWeekend) anchor = 'the day ahead';
      else if (localHour < 12) anchor = 'this morning';
      else if (localHour < 18) anchor = 'this afternoon';
      else anchor = 'this evening';
    }

    // Variable-slot rule: index ≥ 1 must have a *meaningful* secondary
    // signal — distinct event, high load, wearable deficit, or
    // (slot 3 only) tomorrow's calendar. Otherwise drop the slot.
    if (slotIndex >= 1 && !anchorEvent && !highLoad && !hrvDeficit && !sleepDeficit
        && !(slotIndex === 2 && tomorrowEvents.length > 0)
        && !(slotIndex === 2 && dow === 0)
        && !(slotIndex === 2 && (isPersonalHolidayToday || wasPersonalHolidayYesterday) && !!upcomingWeekLeadEvent)) {
      return null;
    }

    return {
      label: `${stateAction} ahead of ${anchor}`,
      eventId: anchorEventId,
      eventTitle: anchorEvent
        ? anchorEvent.title
        : (anchorEventId && upcomingWeekLeadEvent?.id === anchorEventId ? upcomingWeekLeadEvent.title : null),
      categoryId: anchorCategory,
      subtypeId: anchorEnriched?.subtype?.id ?? null,
      scenarioId: anchorEnriched?.scenarioId ?? null,
      leadTimeMin: anchorEnriched?.leadTimeMin ?? null,
      // Phase H fix: state-label slots always anchor in the *pre* phase
      // ("ahead of X"). Surface this so the dedupe ledger can detect
      // collisions with JIT pre-phase anchors.
      phase: anchorEventId ? 'pre' : null,
    };
  };

  const modules: HorizonModule[] = [];

  // Pre-compute JIT phase label once — used by whichever slot lands on the
  // JIT event. Pulled out so Slot 1 (touch1) / Slot 2 (touch2) / Slot 3
  // (post window) all share one phase-aware contract.
  const topEventStartIso = topEvent ? getCalendarEventStartIso(topEvent.event) : null;
  const topEventEndIso = topEvent ? getCalendarEventEndIso(topEvent.event) : null;
  const topEventStartMs = topEventStartIso ? new Date(topEventStartIso).getTime() : null;
  const topEventEndMs = topEventEndIso ? new Date(topEventEndIso).getTime() : null;
  const jitPhase = resolveJitPhaseLabel(jitEventTitle, topEventStartMs, topEventEndMs, nowMs);
  const topEventEnriched = topEvent ? enrichEvent(topEvent.event) : null;
  const topEventCat: any = topEventEnriched?.categoryId ?? null;
  const topEventId: string | null = topEvent?.event?.id ?? null;

  // ─── SLOT 1 (Immediate) ───
  let slot1Practices: any[] = [];
  let slot1IsJit = false;
  let slot1TimeLabel = '';
  let slot1AnchorSnapshot = buildAnchorSnapshot(null, null);
  // Pass 4 — resolved anchor passed to buildSlotContext (title/phase aware why-line)
  let slot1AnchorForCtx: { title: string | null; categoryId: string | null; phase: 'pre' | 'during' | 'post' | null } | null = null;

  if (hasJitEvent && jitMinutesUntil !== null && jitMinutesUntil < 120) {
    // JIT takes slot 1 — include all pre-event modules (up to 3)
    // Phase C.2 — bias toward modules whose practiceType matches the
    // §4 prescribed combo for the resolved phase (e.g. C-pre → somatic.pause
    // → regulate). Falls through to legacy ordering if no match.
    const jitModules: any[] = preEventPlan.modules || [];
    const matched = selectPracticesByCombo(jitModules, jitPhase.combo, new Set(), 3, {
      mode: 'jit+state',
      slotRole: 'pre',
      arcLabel: 'Prepare',
      jitPhase: jitPhase.phase,
      jitEventTitle,
      dayShape: 'mixed_day',
      allocationReason: 'jit_phase_allocation',
    });
    slot1Practices = matched.length > 0 ? matched.slice(0, 3) : jitModules.slice(0, 3);
    if (slot1Practices.length === 0 && todModules[0]) slot1Practices = [todModules[0]];
    slot1IsJit = true;
    slot1TimeLabel = jitPhase.label;
    slot1AnchorSnapshot = buildAnchorSnapshot(topEventId, topEventEnriched, topEvent?.event?.title ?? null);
    slot1AnchorForCtx = { title: truncateTitle(topEvent?.event?.title) ?? null, categoryId: topEventCat ?? null, phase: jitPhase.phase };
  } else if (req.innerReadinessTier === 'depleted') {
    const regMod = todModules.find((m: any) => m.type === 'regulate' && !m.isCoachCard) || todModules.find((m: any) => !m.isCoachCard) || todModules[0];
    slot1Practices = regMod ? [regMod] : [];
    // Add a second practice (align) if available for depleted state
    if (regMod) {
      const alignMod = todModules.find((m: any) => m.contentId !== regMod.contentId && m.type === 'align' && !m.isCoachCard);
      if (alignMod) slot1Practices.push(alignMod);
    }
    const sl = composeStateLabel(0);
    slot1TimeLabel = sl?.label ?? '';
    slotAnchors.push({ eventId: sl?.eventId ?? null, phase: sl?.phase ?? null });
    slot1AnchorSnapshot = sl
      ? {
          anchorEventId: sl.eventId,
          anchorEventTitle: sl.eventTitle ?? null,
          anchorCategoryId: sl.categoryId,
          anchorSubtypeId: sl.subtypeId,
          anchorScenarioId: sl.scenarioId,
          anchorLeadTimeMin: sl.leadTimeMin,
        }
      : buildAnchorSnapshot(null, null);
    if (sl?.eventId) {
      const ev = (req.calendarEvents || []).find((e: any) => e.id === sl.eventId);
      slot1AnchorForCtx = { title: truncateTitle(ev?.title) ?? null, categoryId: sl.categoryId, phase: sl.phase };
    }
  } else {
    slot1Practices = todModules[0] ? [todModules[0]] : [];
    // Add second practice if non-JIT and available
    if (todModules[1] && todModules[1].contentId !== todModules[0]?.contentId) {
      const nextMod = todModules[1];
      // Only add if different type for sequence variety
      if (nextMod.type !== todModules[0]?.type) {
        slot1Practices.push(nextMod);
      }
    }
    // Non-JIT slot 1 — state-anchored label.
    const sl = composeStateLabel(0);
    slot1TimeLabel = sl?.label ?? '';
    slotAnchors.push({ eventId: sl?.eventId ?? null, phase: sl?.phase ?? null });
    slot1AnchorSnapshot = sl
      ? {
          anchorEventId: sl.eventId,
          anchorEventTitle: sl.eventTitle ?? null,
          anchorCategoryId: sl.categoryId,
          anchorSubtypeId: sl.subtypeId,
          anchorScenarioId: sl.scenarioId,
          anchorLeadTimeMin: sl.leadTimeMin,
        }
      : buildAnchorSnapshot(null, null);
    if (sl?.eventId) {
      const ev = (req.calendarEvents || []).find((e: any) => e.id === sl.eventId);
      slot1AnchorForCtx = { title: truncateTitle(ev?.title) ?? null, categoryId: sl.categoryId, phase: sl.phase };
    }
  }
  if (slot1IsJit && topEventId) {
    // Phase C.2 — anchor with phase so the ranked-candidate picker can
    // legitimately reuse the SAME event in slot 2/3 for a different phase
    // (G long-haul pre+during+post, F multi-day, A pre+post, D pre+post).
    slotAnchors.push({ eventId: topEventId, phase: jitPhase.phase });
  }

  if (slot1Practices.length > 0) {
    const primaryPractice = slot1Practices[0];
    const practiceTypes = slot1Practices.map((p: any) => p.type);
    const ctxInput = makeCtxInput('immediate', slot1IsJit, practiceTypes, slot1AnchorForCtx);
    const slotCtx = buildSlotContext(ctxInput);
    const seqReasoning = buildSequenceReasoning(practiceTypes, ctxInput);
    modules.push({
      horizon: 'immediate',
      timeLabel: slot1TimeLabel,
      typeLabel: `${labels[primaryPractice.type] || 'REGULATE'} · ${protocols[primaryPractice.type] || 'Protocol'}`,
      whyLine: slotCtx.whyLine,
      recommendedAction: buildRecommendedAction(primaryPractice.type, ctxInput),
      practice: primaryPractice,
      practices: slot1Practices,
      sequenceReasoning: seqReasoning,
      isJit: slot1IsJit,
      jitEventTitle: slot1IsJit ? jitEventTitle : null,
      jitMinutesUntil: slot1IsJit ? jitMinutesUntil : null,
      showNavyBorder: false,
      showPulse: slot1IsJit && jitMinutesUntil !== null && jitMinutesUntil < 120,
      showPriorityPill: slot1IsJit,
      ...slot1AnchorSnapshot,
      jitPhase: slot1IsJit ? jitPhase.phase : null,
    });
  }

  // ─── SLOT 2 (Tactical) ─── with JIT dedup guard
  let slot2Practices: any[] = [];
  let slot2IsJit = false;
  let slot2TimeLabel = '';
  let slot2NavyBorder = false;
  let slot2AnchorSnapshot = buildAnchorSnapshot(null, null);
  let slot2AnchorForCtx: { title: string | null; categoryId: string | null; phase: 'pre' | 'during' | 'post' | null } | null = null;

  // JIT dedup: if slot 1 already consumed the JIT event, don't reuse it
  // Phase C.2 — walk the ranked (event, phase) candidate list. This handles
  // BOTH cases: (a) slot 1 was state-anchored and a JIT exists further out,
  // and (b) slot 1 was JIT for a multi-phase event whose other phase
  // (during / post) still has slot capacity left (G long-haul, F multi-day,
  // A/D pre+post). Single-phase categories (C/E/B/H, cap=1) naturally fall
  // through because canAnchorAgain returns false after slot 1.
  const slot2Candidate = hasJitEvent ? pickNextRankedCandidate() : null;
  let slot2JitPhaseInfo: ReturnType<typeof resolveJitPhaseLabel> | null = null;
  let slot2JitEventTitle: string | null = null;
  let slot2JitMinutesUntil: number | null = null;
  if (slot2Candidate) {
    const ev = (req.calendarEvents || []).find((e: any) => e.id === slot2Candidate.eventId);
    const slot2Enriched = ev ? enrichEvent(ev) : enrichEvent({ title: slot2Candidate.title || '' });
    const evStart = ev ? new Date(ev.startTime).getTime() : null;
    const evEnd = ev?.endTime ? new Date(ev.endTime).getTime() : null;
    slot2JitPhaseInfo = resolveJitPhaseLabel(slot2Candidate.title, evStart, evEnd, nowMs);
    // Force the phase the ranker chose (resolveJitPhaseLabel may have
    // re-derived a different phase from absolute time — for fan-out we
    // honour the rank decision and only borrow its label string).
    slot2JitPhaseInfo = { ...slot2JitPhaseInfo, phase: slot2Candidate.phase };
    slot2JitEventTitle = slot2Candidate.title;
    slot2JitMinutesUntil = evStart != null ? Math.round((evStart - nowMs) / 60_000) : null;
    // Phase-aware label rebuild (use the ranked candidate's phase verb).
    const truncated = (slot2Candidate.title || 'this event').split(/\s+/).slice(0, 5).join(' ');
    const isHighStakesPost = slot2Candidate.phase === 'post' && (slot2Candidate.categoryId === 'A' || slot2Candidate.categoryId === 'D');
    const label = slot2Candidate.phase === 'pre' ? `Prepare ahead of ${truncated}`
      : slot2Candidate.phase === 'during' ? `Stay regulated through ${truncated}`
      : `${isHighStakesPost ? 'Reset' : 'Recover'} after ${truncated}`;
    slot2TimeLabel = label;
    slot2IsJit = true;
    slot2AnchorSnapshot = buildAnchorSnapshot(slot2Candidate.eventId, slot2Enriched, slot2Candidate.title);
    slot2AnchorForCtx = { title: truncateTitle(slot2Candidate.title) ?? null, categoryId: (slot2Candidate.categoryId as any) ?? null, phase: slot2Candidate.phase };
    // Imminent (≤6h) keeps navy emphasis; far-out fan-out stays standard.
    slot2NavyBorder = slot2JitMinutesUntil !== null && slot2JitMinutesUntil >= 0 && slot2JitMinutesUntil <= 360;
    // Practice pool: prefer the dedicated pre-event modules when the
    // candidate matches the originally-staged JIT event; otherwise fall
    // back to todModules. In both cases filter by the candidate's combo.
    const pool = (slot2Candidate.eventId === topEventId && preEventPlan?.modules?.length)
      ? preEventPlan.modules
      : todModules;
    const slot1Ids = new Set<string>(slot1Practices.map((p: any) => p.contentId).filter(Boolean));
    const matched = selectPracticesByCombo(pool, slot2Candidate.comboKey, slot1Ids, 2, {
      mode: slot2Candidate.phase === 'during' || slot2Candidate.phase === 'post' ? 'full_arc' : 'jit+state',
      slotRole: slot2Candidate.phase === 'during' ? 'during' : slot2Candidate.phase === 'post' ? 'post' : 'dominant_demand',
      arcLabel: slot2Candidate.phase === 'during' ? 'During' : slot2Candidate.phase === 'post' ? 'Recover' : 'Prepare',
      jitPhase: slot2Candidate.phase,
      jitEventTitle: slot2JitEventTitle,
      dayShape: 'mixed_day',
      allocationReason: 'ranked_jit_candidate',
    });
    slot2Practices = matched.length > 0
      ? matched
      : (todModules[1] ? [todModules[1]] : (todModules[0] ? [todModules[0]] : []));
  } else {
    // Second ToD module(s), skipping slot1 IDs
    const slot1Ids = new Set(slot1Practices.map((p: any) => p.contentId));
    const remaining = todModules.filter((m: any) => !slot1Ids.has(m.contentId));
    slot2Practices = remaining.length > 0 ? [remaining[0]] : (todModules[1] ? [todModules[1]] : (todModules[0] ? [todModules[0]] : []));
    // Add second practice for tactical depth
    if (remaining.length > 1 && remaining[1].type !== remaining[0]?.type) {
      slot2Practices.push(remaining[1]);
    }
    const sl = composeStateLabel(1);
    if (sl) {
      slot2TimeLabel = sl.label;
      slotAnchors.push({ eventId: sl.eventId, phase: sl.phase });
      slot2AnchorSnapshot = {
        anchorEventId: sl.eventId,
        anchorEventTitle: sl.eventTitle ?? null,
        anchorCategoryId: sl.categoryId,
        anchorSubtypeId: sl.subtypeId,
        anchorScenarioId: sl.scenarioId,
        anchorLeadTimeMin: sl.leadTimeMin,
      };
      if (sl.eventId) {
        const ev = (req.calendarEvents || []).find((e: any) => e.id === sl.eventId);
        slot2AnchorForCtx = { title: truncateTitle(ev?.title) ?? null, categoryId: sl.categoryId, phase: sl.phase };
      }
    } else {
      slot2TimeLabel = '';
      slot2Practices = []; // signal "drop this slot"
    }
  }
  if (slot2IsJit && slot2Candidate) {
    slotAnchors.push({ eventId: slot2Candidate.eventId, phase: slot2Candidate.phase });
  }

  if (slot2Practices.length > 0) {
    const primaryPractice = slot2Practices[0];
    const practiceTypes = slot2Practices.map((p: any) => p.type);
    const ctxInput = makeCtxInput('tactical', slot2IsJit, practiceTypes, slot2AnchorForCtx);
    const slotCtx = buildSlotContext(ctxInput);
    const seqReasoning = buildSequenceReasoning(practiceTypes, ctxInput);
    modules.push({
      horizon: 'tactical',
      timeLabel: slot2TimeLabel,
      typeLabel: `${labels[primaryPractice.type] || 'ALIGN'} · ${protocols[primaryPractice.type] || 'Protocol'}`,
      whyLine: slotCtx.whyLine,
      recommendedAction: buildRecommendedAction(primaryPractice.type, ctxInput),
      practice: primaryPractice,
      practices: slot2Practices,
      sequenceReasoning: seqReasoning,
      isJit: slot2IsJit,
      jitEventTitle: slot2IsJit ? (slot2JitEventTitle ?? jitEventTitle) : null,
      jitMinutesUntil: slot2IsJit ? (slot2JitMinutesUntil ?? jitMinutesUntil) : null,
      showNavyBorder: slot2NavyBorder,
      showPulse: false,
      showPriorityPill: slot2IsJit,
      ...slot2AnchorSnapshot,
      jitPhase: slot2IsJit ? (slot2Candidate?.phase ?? jitPhase.phase) : null,
    });
  }

  // ─── SLOT 3 (Strategic or second Immediate) ───
  let slot3Practices: any[] = [];
  let slot3Horizon: 'immediate' | 'tactical' | 'strategic' = 'strategic';
  let slot3TimeLabel = '';
  let slot3IsJit = false;
  let slot3JitEventTitle: string | null = null;
  let slot3JitMinutesUntil: number | null = null;
  let slot3JitPhase: 'pre' | 'during' | 'post' | null = null;
  let slot3AnchorSnapshot = buildAnchorSnapshot(null, null);
  let slot3AnchorForCtx: { title: string | null; categoryId: string | null; phase: 'pre' | 'during' | 'post' | null } | null = null;

  const usedIds = new Set([...slot1Practices, ...slot2Practices].map((p: any) => p.contentId).filter(Boolean));

  // Phase C.2 — third-slot multi-phase fan-out (G long-haul, F multi-day).
  // Only fires when a *third* distinct (event, phase) candidate still has
  // capacity AND we already shipped two JIT-aligned slots. Single-phase
  // categories (cap=1) and 2-cap (A/D) naturally fall through.
  //
  // Slot-3 post-phase guard (CEO doc — variable slot rule): a `post` phase
  // candidate is only meaningful when the underlying event has actually
  // ended (or is within the closing 15 minutes). When the event has no
  // endTime, the endTime is malformed, or the event is still clearly in
  // progress, the post-phase candidate is invalid — slot 3 must drop it
  // and fall back to state-management (composeStateLabel) or be dropped
  // entirely by the variable-slot dedup pass. We never pad a duplicate
  // post-phase slot just to fill three cards.
  const isPostPhaseValid = (cand: RankedJitCandidate): boolean => {
    if (cand.phase !== 'post') return true;
    const ev = (req.calendarEvents || []).find((e: any) => e.id === cand.eventId);
    const endRaw = ev?.endTime ?? ev?.startTime;
    if (!endRaw) return false;
    const endMs = new Date(endRaw).getTime();
    if (!Number.isFinite(endMs)) return false;
    // Valid only when the event is over (or within the last 15 min of running).
    return (endMs - nowMs) <= 15 * 60_000;
  };
  const pickSlot3Candidate = (): RankedJitCandidate | null => {
    if (!hasJitEvent) return null;
    for (const c of jitRankedCandidates) {
      if (!c.eventId) continue;
      if (!canAnchorAgain(c.eventId, c.categoryId)) continue;
      if (phaseAlreadyAnchored(c.eventId, c.phase)) continue;
      if (!isPostPhaseValid(c)) continue;
      return c;
    }
    return null;
  };
  const slot3Candidate = pickSlot3Candidate();
  if (slot3Candidate) {
    const ev = (req.calendarEvents || []).find((e: any) => e.id === slot3Candidate.eventId);
    const slot3Enriched = ev ? enrichEvent(ev) : enrichEvent({ title: slot3Candidate.title || '' });
    const evStart = ev ? new Date(ev.startTime).getTime() : null;
    slot3JitMinutesUntil = evStart != null ? Math.round((evStart - nowMs) / 60_000) : null;
    const truncated = (slot3Candidate.title || 'this event').split(/\s+/).slice(0, 5).join(' ');
    const isHighStakesPost = slot3Candidate.phase === 'post' && (slot3Candidate.categoryId === 'A' || slot3Candidate.categoryId === 'D');
    slot3TimeLabel = slot3Candidate.phase === 'pre' ? `Prepare ahead of ${truncated}`
      : slot3Candidate.phase === 'during' ? `Stay regulated through ${truncated}`
      : `${isHighStakesPost ? 'Reset' : 'Recover'} after ${truncated}`;
    slot3IsJit = true;
    slot3JitEventTitle = slot3Candidate.title;
    slot3JitPhase = slot3Candidate.phase;
    slot3Horizon = 'tactical';
    slot3AnchorSnapshot = buildAnchorSnapshot(slot3Candidate.eventId, slot3Enriched, slot3Candidate.title);
    const pool = (slot3Candidate.eventId === topEventId && preEventPlan?.modules?.length)
      ? preEventPlan.modules
      : todModules;
    const matched = selectPracticesByCombo(pool, slot3Candidate.comboKey, usedIds, 2, {
      mode: slot3Candidate.phase === 'during' || slot3Candidate.phase === 'post' ? 'full_arc' : 'jit+state',
      slotRole: slot3Candidate.phase === 'during' ? 'during' : slot3Candidate.phase === 'post' ? 'post' : 'recovery',
      arcLabel: slot3Candidate.phase === 'during' ? 'During' : slot3Candidate.phase === 'post' ? 'Recover' : 'Recover',
      jitPhase: slot3JitPhase,
      jitEventTitle: slot3JitEventTitle,
      dayShape: 'mixed_day',
      allocationReason: 'ranked_jit_candidate',
    });
    slot3Practices = matched.length > 0 ? matched : (todModules.find((m: any) => !usedIds.has(m.contentId)) ? [todModules.find((m: any) => !usedIds.has(m.contentId))] : []);
    slotAnchors.push({ eventId: slot3Candidate.eventId, phase: slot3Candidate.phase });
    slot3AnchorForCtx = { title: truncateTitle(slot3Candidate.title) ?? null, categoryId: (slot3Candidate.categoryId as any) ?? null, phase: slot3Candidate.phase };
  } else if (pattern === '2immediate-1tactical') {
    const nextMod = todModules.find((m: any) => !usedIds.has(m.contentId)) || todModules[todModules.length - 1];
    slot3Practices = nextMod ? [nextMod] : [];
    slot3Horizon = 'immediate';
    const sl = composeStateLabel(2);
    if (sl) {
      slot3TimeLabel = sl.label;
      slotAnchors.push({ eventId: sl.eventId, phase: sl.phase });
      slot3AnchorSnapshot = {
        anchorEventId: sl.eventId,
        anchorEventTitle: sl.eventTitle ?? null,
        anchorCategoryId: sl.categoryId,
        anchorSubtypeId: sl.subtypeId,
        anchorScenarioId: sl.scenarioId,
        anchorLeadTimeMin: sl.leadTimeMin,
      };
      if (sl.eventId) {
        const ev = (req.calendarEvents || []).find((e: any) => e.id === sl.eventId);
        slot3AnchorForCtx = { title: truncateTitle(ev?.title) ?? null, categoryId: sl.categoryId, phase: sl.phase };
      }
    }
    else { slot3TimeLabel = ''; slot3Practices = []; }
  } else {
    // Coach suppression: never lift coach cards into the strategic slot.
    // Integrate-type practices are still eligible — they host the inline
    // Reflection Corner UI.
    const strategicModule = todModules.find((m: any) => !usedIds.has(m.contentId) && m.type === 'integrate' && !m.isCoachCard);
    const fallbackModule = todModules.find((m: any) => !usedIds.has(m.contentId)) || todModules[todModules.length - 1];
    const primaryMod = strategicModule || fallbackModule;
    slot3Practices = primaryMod ? [primaryMod] : [];
    // Add second strategic practice if available
    if (primaryMod) {
      const secondMod = todModules.find((m: any) => !usedIds.has(m.contentId) && m.contentId !== primaryMod.contentId);
      if (secondMod) slot3Practices.push(secondMod);
    }
    const sl = composeStateLabel(2);
    if (sl) {
      slot3TimeLabel = sl.label;
      slotAnchors.push({ eventId: sl.eventId, phase: sl.phase });
      slot3AnchorSnapshot = {
        anchorEventId: sl.eventId,
        anchorEventTitle: sl.eventTitle ?? null,
        anchorCategoryId: sl.categoryId,
        anchorSubtypeId: sl.subtypeId,
        anchorScenarioId: sl.scenarioId,
        anchorLeadTimeMin: sl.leadTimeMin,
      };
      if (sl.eventId) {
        const ev = (req.calendarEvents || []).find((e: any) => e.id === sl.eventId);
        slot3AnchorForCtx = { title: truncateTitle(ev?.title) ?? null, categoryId: sl.categoryId, phase: sl.phase };
      }
    }
    else { slot3TimeLabel = ''; slot3Practices = []; }
  }

  if (slot3Practices.length > 0) {
    const primaryPractice = slot3Practices[0];
    const practiceTypes = slot3Practices.map((p: any) => p.type);
    const ctxInput = makeCtxInput(slot3Horizon, slot3IsJit, practiceTypes, slot3AnchorForCtx);
    const slotCtx = buildSlotContext(ctxInput);
    const seqReasoning = buildSequenceReasoning(practiceTypes, ctxInput);
    modules.push({
      horizon: slot3Horizon,
      timeLabel: slot3TimeLabel,
      typeLabel: `${labels[primaryPractice.type] || 'INTEGRATE'} · ${protocols[primaryPractice.type] || 'Protocol'}`,
      whyLine: slotCtx.whyLine,
      recommendedAction: buildRecommendedAction(primaryPractice.type, ctxInput),
      practice: primaryPractice,
      practices: slot3Practices,
      sequenceReasoning: seqReasoning,
      isJit: slot3IsJit,
      jitEventTitle: slot3JitEventTitle,
      jitMinutesUntil: slot3JitMinutesUntil,
      showNavyBorder: false,
      showPulse: false,
      showPriorityPill: slot3IsJit,
      ...slot3AnchorSnapshot,
      jitPhase: slot3JitPhase,
    });
  }

  // Deduplicate: ensure no two slots share the same primary contentId or
  // practice type. Content IDs alone still allowed e.g. two different
  // "regulate" practices in the same Plan stack.
  const practiceTypeOf = (p: any): string | null =>
    typeof p?.type === 'string' && p.type.trim().length > 0 ? p.type.trim() : null;
  const practiceTypeForContent = (c: any): string | null => {
    if (typeof c?.type === 'string' && c.type.trim().length > 0) return c.type.trim();
    const contentType = typeof c?.content_type === 'string' ? c.content_type : null;
    if (contentType === 'soundbath' || contentType === 'guided-practice') return 'regulate';
    if (contentType === 'micro-practice') return 'align';
    return null;
  };
  const seenContentIds = new Set<string>();
  const seenPracticeTypes = new Set<string>();
  const deduped: HorizonModule[] = [];
  for (const m of modules) {
    // Variable-slot rule: drop slots whose state-anchor resolved to null
    // (composeStateLabel returned null → empty timeLabel + zero practices).
    if (!m.timeLabel || (m.practices?.length ?? 0) === 0) continue;
    const primaryType = practiceTypeOf(m.practice);
    if (!seenContentIds.has(m.practice.contentId) && (!primaryType || !seenPracticeTypes.has(primaryType))) {
      // Also deduplicate within practices array
      const uniquePractices: any[] = [];
      const practiceIds = new Set<string>();
      const practiceTypes = new Set<string>();
      for (const p of m.practices) {
        const pType = practiceTypeOf(p);
        if (
          !seenContentIds.has(p.contentId) &&
          !practiceIds.has(p.contentId) &&
          (!pType || (!seenPracticeTypes.has(pType) && !practiceTypes.has(pType)))
        ) {
          practiceIds.add(p.contentId);
          if (pType) practiceTypes.add(pType);
          uniquePractices.push(p);
        } else {
          console.log('[generate-mastery-plan] practice dedupe: dropped duplicate', {
            contentId: p.contentId ?? null,
            type: pType,
            reason: seenContentIds.has(p.contentId) || practiceIds.has(p.contentId)
              ? 'content-duplicate'
              : 'type-duplicate',
          });
        }
      }
      m.practices = uniquePractices.length > 0 ? uniquePractices : [m.practice];
      m.practice = m.practices[0];
      seenContentIds.add(m.practice.contentId);
      for (const p of m.practices) {
        seenContentIds.add(p.contentId);
        const pType = practiceTypeOf(p);
        if (pType) seenPracticeTypes.add(pType);
      }
      deduped.push(m);
    } else {
      console.log('[generate-mastery-plan] practice dedupe: dropped duplicate slot primary', {
        contentId: m.practice?.contentId ?? null,
        type: primaryType,
        reason: seenContentIds.has(m.practice?.contentId) ? 'content-duplicate' : 'type-duplicate',
      });
    }
  }

  // Filler pass — only runs when slot 1 itself is missing (e.g. no
  // todModules at all). Per the variable-slot contract, we never pad
  // beyond what composeStateLabel agrees is a meaningful anchor.
  //
  // Habit-building minimum-slot rule (CEO doc):
  //  • Weekday, no JIT, no PTO/holiday → guarantee 2 slots (morning anchor
  //    + evening recovery building toward tomorrow).
  //  • Weekday + PTO/public/personal holiday → 1 morning slot only.
  //  • Saturday → 1 morning slot mandatory.
  //  • Sunday → 1 slot mandatory (afternoon/evening week-ahead prep).
  //  • Any JIT-bearing day → existing variable-slot logic owns it.
  const tzOffsetMin = (req as any).timezoneOffset ?? 0;
  const _localNow = new Date(Date.now() - tzOffsetMin * 60000);
  const _dow = _localNow.getUTCDay(); // 0 Sun .. 6 Sat
  const _isWeekday = _dow >= 1 && _dow <= 5;
  const _hasAnyJit = !!preEventPlan;
  // PTO / public-holiday detection delegated to the canonical availability
  // SSOT. Regional / FYI holidays that don't apply to the user MUST NOT
  // collapse the plan to a single slot, and calendar work evidence MUST
  // override any rest signal — both handled inside the classifier.
  const _availability = classifyAvailability({
    now: _localNow,
    userHomeCountry: (req as any).userHomeCountry ?? (req as any).country ?? null,
    userCurrentCountry: (req as any).userCurrentCountry ?? null,
    explicitPto: (req as any).explicitPto === true,
    calendarLoad: (req as any).calendarLoad ?? null,
    events: (req.calendarEvents || []).map((e: any) => ({
      title: String(e?.title || ''),
      startTime: String(e?.startTime || e?.start_time || ''),
      endTime: String(e?.endTime || e?.end_time || e?.startTime || ''),
      isAllDay: e?.isAllDay === true || e?.is_all_day === true ||
        ((new Date(e?.endTime || e?.startTime || 0).getTime() -
          new Date(e?.startTime || 0).getTime()) >= 20 * 3600 * 1000),
      isOrganizer: e?.isOrganizer === true || e?.is_organizer === true,
      attendeesCount: Number(e?.attendeesCount ?? e?.attendees_count ?? 0) || 0,
      source: e?.source ?? e?.calendarName ?? null,
      calendarSummary: e?.calendarSummary ?? e?.calendar_summary ?? null,
    })),
  });
  const _isPtoOrHoliday = _availability.isRestDay &&
    (_availability.state === 'PTO' || _availability.state === 'PUBLIC_HOLIDAY');
  let _minSlots = 1;
  if (!_hasAnyJit && _isWeekday && !_isPtoOrHoliday) _minSlots = 2;
  if (_hasAnyJit && !_isPtoOrHoliday) {
    const meaningfulAnchors = new Set<string>();
    for (const e of todayRemainingEvents) {
      const title = String(e?.title || '').trim();
      const id = String(e?.id || title || '').trim();
      if (!id || !title) continue;
      if (isNoiseTitle(title)) continue;
      meaningfulAnchors.add(id);
    }
    if (meaningfulAnchors.size > 1) {
      _minSlots = Math.min(3, meaningfulAnchors.size);
    }
    if (deduped.length < _minSlots) {
      console.log('[generate-mastery-plan] JIT day min-slots expanded for distinct anchors', {
        minSlots: _minSlots,
        anchors: Array.from(meaningfulAnchors).slice(0, 6),
        currentSlots: deduped.map((m: any) => ({
          title: m.timeLabel,
          anchorEventId: m.anchorEventId ?? null,
          phase: m.jitPhase ?? null,
        })),
      });
    }
  }

  if (deduped.length < _minSlots && enrichedContent.length > 0) {
    const remaining = enrichedContent.filter((c: any) => {
      if (seenContentIds.has(c.id) || req.completedToday.includes(c.id)) return false;
      const cType = practiceTypeForContent(c);
      return !cType || !seenPracticeTypes.has(cType);
    });
    const hasBodyUnderLoad = req.wearableContext?.hasData && req.wearableContext.hrvDeviation !== null && req.wearableContext.hrvDeviation < -15;
    const hasMaskedHigh = divergenceMode === 'MASKED_HIGH';
    const clarityLow = req.clarityLevel <= 2;
    const confidenceLow = req.confidenceLevel <= 2;
    const poorSleep = req.wearableContext?.hasData && req.wearableContext.sleepScore !== null && req.wearableContext.sleepScore < 70;
    const isNewUser = (shared.innerReadinessPattern.values?.length || 0) < 7;
    const isHeavyDay = req.calendarLoad === 'high' || req.calendarLoad === 'extreme';

    const needsHorizons: ('immediate' | 'tactical' | 'strategic')[] =
      _minSlots >= 3 ? ['immediate', 'tactical', 'strategic'] :
      _minSlots >= 2 ? ['immediate', 'tactical'] :
      ['immediate'];

    for (const targetHorizon of needsHorizons) {
      if (deduped.length >= _minSlots) break;

      let pool = remaining.filter((c: any) => {
        const hTags: string[] = c.horizonTags || [];
        return hTags.includes(targetHorizon);
      });

      const foundationalCount = deduped.filter(m => {
        const meta = enrichedContent.find((ec: any) => ec.id === m.practice.contentId);
        return meta?.isFoundational === true;
      }).length;
      if (isNewUser && foundationalCount < 2) {
        const foundPool = pool.filter((c: any) => c.isFoundational === true);
        if (foundPool.length > 0) pool = foundPool;
      }

      const slotIndex = deduped.length;
      if (isHeavyDay && slotIndex < 2) {
        pool = pool.filter((c: any) => c.durationBand === 'micro' || c.durationBand === 'short');
      }

      if (pool.length === 0) {
        pool = remaining.filter((c: any) => {
          if (seenContentIds.has(c.id)) return false;
          const cType = practiceTypeForContent(c);
          return !cType || !seenPracticeTypes.has(cType);
        });
      }

      if (pool.length === 0) break;

      // Resolve the slot's intent FIRST so content scoring is bound to
      // the verb the title will render. composeStateLabel is the source
      // of truth for stateAction + anchor category — re-use it here so
      // the selector and the title can't drift.
      const intentLabel = composeStateLabel((Math.min(slotIndex, 2) as 0 | 1 | 2));
      // Recover the verb the label uses (everything before " ahead of ").
      const labelText = String(intentLabel?.label || '');
      const stateActionFromLabel = labelText.includes(' ahead of ')
        ? labelText.split(' ahead of ')[0]
        : labelText;
      const slotIntent: SlotIntent = deriveSlotIntent({
        stateAction: stateActionFromLabel,
        anchorCategory: (intentLabel?.categoryId ?? null) as any,
        anchorPhase: (intentLabel?.phase ?? null) as any,
        practicePriorityTag: (req as any).practicePriorityTag ?? null,
      });

      const scored = pool.map((c: any) => {
        let score = 0;
        const ssTags: string[] = c.stateSignalTags || [];
        if (hasBodyUnderLoad && ssTags.includes('signal-body-under-load')) score += 15;
        if (hasMaskedHigh && ssTags.includes('signal-masked-high')) score += 20;
        if (clarityLow && ssTags.includes('signal-clarity-low')) score += 15;
        if (confidenceLow && ssTags.includes('signal-confidence-low')) score += 15;
        if (poorSleep && ssTags.includes('signal-poor-sleep')) score += 10;
        if (req.favorites.includes(c.id)) score += 30;
        if (!isNewUser && c.isFoundational) score -= 5;
        // Slot-intent binding (meta_skill + Recalibrate category + combo).
        // This is the fix for "Sharpen focus slot selecting meta-renewal".
        const intentScore = scoreContentAgainstIntent(c, slotIntent);
        score += intentScore.total;
        // Phase L — 7-day recency penalty so the filler rotates across the
        // catalog instead of re-suggesting the same module daily.
        const recencyMap: Record<string, number> = (req as any).recentPracticeDays || {};
        const dAgo = recencyMap[c.id];
        if (dAgo !== undefined) {
          if (dAgo <= 1) score -= 25;
          else if (dAgo <= 3) score -= 12;
          else if (dAgo <= 7) score -= 5;
        }
        // Phase L — cross-slot type diversity: penalise content_type that
        // already appears in an emitted slot in this plan, so the filler
        // adds variety rather than stacking the same protocol family.
        const emittedTypes = new Set(
          deduped.map((m: any) => m.practice?.contentType).filter(Boolean),
        );
        if (emittedTypes.has(c.content_type)) score -= 8;
        return { content: c, score, intentScore };
      });
      scored.sort((a: any, b: any) => b.score - a.score);

      const selected = scored[0]?.content;
      if (!selected) break;
      // Telemetry — surfaces whether the intent binding is actually
      // discriminating. Watch for `intentTotal <= 0` rates climbing.
      console.log('[generate-mastery-plan][filler] intent-scored selection', {
        slotIndex,
        intent: slotIntent.intentLabel,
        intentTargets: { meta: slotIntent.metaSkills, recal: slotIntent.recalibrateCategories },
        selectedId: selected.id,
        selectedMetaSkill: selected.metaSkillTags,
        selectedCategory: selected.category,
        intentTotal: scored[0]?.intentScore?.total ?? 0,
        finalScore: scored[0]?.score ?? 0,
      });

      seenContentIds.add(selected.id);
      const contentType = selected.content_type || 'micro-practice';
      const moduleType = contentType === 'soundbath' ? 'regulate' : contentType === 'guided-practice' ? 'regulate' : 'align';
      seenPracticeTypes.add(moduleType);
      // Pass 4 — compose state-label first so the filler's why-line can be
      // anchored to the resolved event (matches the timeLabel verb).
      const fillerSlotIdx = (Math.min(deduped.length, 2) as 0 | 1 | 2);
      const fillerLabel = composeStateLabel(fillerSlotIdx);
      let fillerAnchorForCtx: { title: string | null; categoryId: string | null; phase: 'pre' | 'during' | 'post' | null } | null = null;
      if (fillerLabel?.eventId) {
        const ev = (req.calendarEvents || []).find((e: any) => e.id === fillerLabel.eventId);
        fillerAnchorForCtx = { title: truncateTitle(ev?.title) ?? null, categoryId: fillerLabel.categoryId, phase: fillerLabel.phase };
      }
      const ctxInput = makeCtxInput(targetHorizon, false, undefined, fillerAnchorForCtx);
      const slotCtx = buildSlotContext(ctxInput);
      const fillerPractice = {
        type: moduleType,
        contentId: selected.id,
        title: selected.title,
        contentType: selected.content_type,
        duration: selected.duration || 3,
        focus: moduleType === 'regulate' ? 'composure' : 'clarity',
        intensity: 'gentle',
        isFavorite: req.favorites.includes(selected.id),
        isCoachCard: false,
        reasoning: slotCtx.whyLine,
        thumbnailUrl: selected.thumbnail_url,
      };
      if (fillerLabel) {
        slotAnchors.push({ eventId: fillerLabel.eventId, phase: fillerLabel.phase });
      }
      deduped.push({
        horizon: targetHorizon,
        timeLabel: fillerLabel?.label ?? 'Steady the system ahead of today\u2019s load',
        typeLabel: `${labels[moduleType] || 'REGULATE'} · ${protocols[moduleType] || 'Protocol'}`,
        whyLine: slotCtx.whyLine,
        recommendedAction: buildRecommendedAction(moduleType, ctxInput),
        practice: fillerPractice,
        practices: [fillerPractice],
        isJit: false,
        jitEventTitle: null,
        jitMinutesUntil: null,
        showNavyBorder: false,
        showPulse: false,
        showPriorityPill: false,
        anchorEventId: fillerLabel?.eventId ?? null,
        anchorCategoryId: fillerLabel?.categoryId ?? null,
        anchorSubtypeId: fillerLabel?.subtypeId ?? null,
        anchorScenarioId: fillerLabel?.scenarioId ?? null,
        anchorLeadTimeMin: fillerLabel?.leadTimeMin ?? null,
      });
    }
  }

  // Final guard: forbidden bare-time literals must never reach the client.
  // If any sneaks through, rewrite via composeStateLabel so the slot stays
  // anchored to a calendar / performance moment (Contracts A–E).
  const FORBIDDEN_LITERALS = new Set<string>([
    'Midday reset', 'Later today', 'When you have space', 'This evening',
    'Before bed', 'For your development', 'When ready', 'Right now',
    'Prepare for the day', 'Prepare for tomorrow', 'Morning reset',
    'Prevent the afternoon dip',
  ]);
  const out = deduped.slice(0, 3);
  for (let i = 0; i < out.length; i++) {
    const lbl = String(out[i].timeLabel || '').trim();
    if (!lbl || FORBIDDEN_LITERALS.has(lbl)) {
      const idx = (Math.min(i, 2) as 0 | 1 | 2);
      const sl = composeStateLabel(idx);
      const replacement = sl?.label ?? 'Steady the system ahead of today\u2019s load';
      console.warn('[generate-mastery-plan] blacklisted timeLabel rewritten', {
        slotIndex: i, original: lbl, replacement,
      });
      out[i] = { ...out[i], timeLabel: replacement };
    }
  }
  const allocation = allocatePlanSlots({
    nowMs,
    rankedCandidates: jitRankedCandidates,
    ...deriveStructuralDayFlags(req.calendarEvents, (req as any).calendarLoad),
  });
  const finalized = out.map((m, idx) => {
    const a = allocation.slots[idx];
    // Sprint 1 (Phase 2): allocator IDENTITY wins over legacy slot identity.
    // Legacy `m` may still supply CONTENT fields (whyLine, timeLabel,
    // practice, recommendedAction, anchorEventId/anchorCategoryId derived
    // from the fresh module). Identity (which event, which phase, which
    // arc, which role) is authoritatively decided by allocatePlanSlots.
    const merged: any = {
      ...m,
      mode: allocation.mode,
      dayShape: allocation.dayShape,
      slotAllocationDebug: allocation.debug,
      slotRole: a?.slotRole ?? (m as any).slotRole,
      allocationReason: a?.allocationReason ?? (m as any).allocationReason,
      arcLabel: a?.arcLabel ?? m.arcLabel ?? undefined,
      jitPhase: a?.jitPhase ?? m.jitPhase ?? null,
      jitEventTitle: a?.jitEventTitle ?? m.jitEventTitle ?? null,
      // If the allocator degraded this slot to state fallback (jit fields
      // null), zero out legacy anchor identity too so the frontend does
    // not resurrect a "During" from stale `m` anchor fields.
    };
    if (a && a.jitPhase == null && a.jitEventTitle == null) {
      merged.isJit = false;
      merged.anchorEventId = null;
      merged.anchorCategoryId = null;
    } else if (a?.jitEventId) {
      merged.anchorEventId = a.jitEventId;
      merged.anchorCategoryId = a.jitCategoryId ?? (m as any).anchorCategoryId ?? null;
    }
    return merged;
  });
  try {
    console.info('[generate-mastery-plan][slot-allocation-final]', {
      source: 'fresh',
      dayShape: allocation.dayShape,
      mode: allocation.mode,
      slots: finalized.map((m: any, idx: number) => ({
        idx,
        allocatorPhase: allocation.slots[idx]?.jitPhase ?? null,
        finalPhase: m.jitPhase ?? null,
        allocatorTitle: allocation.slots[idx]?.jitEventTitle ?? null,
        finalTitle: m.jitEventTitle ?? null,
        identityMatched:
          (allocation.slots[idx]?.jitPhase ?? null) === (m.jitPhase ?? null) &&
          (allocation.slots[idx]?.jitEventTitle ?? null) === (m.jitEventTitle ?? null),
        slotRole: m.slotRole,
        allocationReason: m.allocationReason,
      })),
    });
  } catch { /* logging must not break plan */ }
  return finalized;
}

// ==================== STATEFUL PLAN LEDGER ====================

interface PlanLedger {
  modules: HorizonModule[];
  generatedAt: string;
  generatedPeriod?: string;
  source?: string;
  userEdits?: {
    slotEdits?: Record<string, {
      cancelled?: boolean;
      cancelReason?: string | null;
      replacementEventIds?: string[];
      priorityTag?: 'high' | 'medium' | 'low' | null;
      relationshipTag?: string | null;
      customTags?: string[];
      updatedAt?: string;
    }>;
    updatedAt?: string;
  };
}

/**
 * Load the EARLIEST same-day plan_ledger across all of today's
 * daily_ritual_completions rows. The earliest row owns the canonical lineage
 * (morning anchors are protected first); later periods evolve from it.
 * If no row has a ledger yet, returns null.
 */
async function loadTodayPlanLedger(
  userId: string,
  ritualDate: string,
  supabaseClient: any,
): Promise<PlanLedger | null> {
  try {
    const { data, error } = await supabaseClient
      .from('daily_ritual_completions')
      .select('plan_ledger, created_at, updated_at, session_period')
      .eq('user_id', userId)
      .eq('ritual_date', ritualDate)
      .not('plan_ledger', 'is', null)
      .order('created_at', { ascending: true });
    if (error || !data || data.length === 0) return null;
    const earliest = data.find((row: any) => row?.plan_ledger && Array.isArray((row.plan_ledger as PlanLedger).modules))?.plan_ledger as PlanLedger | null;
    if (!earliest || !Array.isArray(earliest.modules)) return null;

    const mergedSlotEdits: NonNullable<NonNullable<PlanLedger['userEdits']>['slotEdits']> = {};
    for (const row of data) {
      const ledger = row?.plan_ledger as PlanLedger | null;
      const slotEdits = ledger?.userEdits?.slotEdits || {};
      for (const [slotKey, edit] of Object.entries(slotEdits)) {
        if (!slotKey) continue;
        mergedSlotEdits[slotKey] = {
          ...(mergedSlotEdits[slotKey] || {}),
          ...edit,
        };
      }
    }

    return {
      ...earliest,
      userEdits: Object.keys(mergedSlotEdits).length > 0
        ? {
            slotEdits: mergedSlotEdits,
            updatedAt: new Date().toISOString(),
          }
        : earliest.userEdits,
    };
  } catch {
    return null;
  }
}

function applyLedgerEditsToModules(
  modules: HorizonModule[],
  userEdits?: PlanLedger['userEdits'],
): HorizonModule[] {
  const slotEdits = userEdits?.slotEdits || {};
  return modules.map((module, index) => {
    const edit = slotEdits[`slot-${index}`];
    if (!edit) return module;
    return {
      ...module,
      isCancelled: edit.cancelled === true,
      cancelReason: edit.cancelReason ?? null,
      replacementEventIds: edit.replacementEventIds || [],
      priorityTag: edit.priorityTag ?? null,
      relationshipTag: edit.relationshipTag ?? null,
      customTags: edit.customTags || [],
    };
  });
}

/**
 * Determine if a ledger slot is "completed" (all of its primary practice IDs
 * appear in today's completion union). We consider the slot done if the
 * primary practice (slot.practice.contentId) is completed — secondary
 * practices follow the player queue contract and don't gate the slot tick.
 */
function isSlotCompleted(slot: HorizonModule, completedIds: Set<string>): boolean {
  const primary = slot?.practice?.contentId;
  if (!primary) return false;
  return completedIds.has(primary);
}

/**
 * Stateful merge of fresh-derived horizon modules against today's ledger.
 *
 * Returns the 3-slot plan to render PLUS metadata describing how it was built.
 */
/**
 * Sprint 2 (Phase 3) – Derive real day-shape structural flags from the raw
 * calendar event list. Extracted so the fresh-generation path and the
 * ledger-evolution path share ONE definition and cannot drift.
 */
export function deriveStructuralDayFlags(
  calendarEvents: any[] | null | undefined,
  calendarLoad?: string,
  opts?: {
    now?: Date;
    userHomeCountry?: string | null;
    userCurrentCountry?: string | null;
    explicitPto?: boolean;
  },
): {
  hasTravelDay: boolean;
  hasConferenceDay: boolean;
  hasOffsiteDay: boolean;
  hasRestSignals: boolean;
} {
  const events = Array.isArray(calendarEvents) ? calendarEvents : [];
  const titleOf = (e: any) => String(e?.title || '');
  const hasTravelDay = events.some((e: any) => /travel|flight|train|airport|hotel/i.test(titleOf(e)));
  const hasConferenceDay = events.some((e: any) => /conference|offsite|retreat|summit/i.test(titleOf(e)));
  const hasOffsiteDay = events.some((e: any) => /offsite|off-site/i.test(titleOf(e)));
  // Canonical Rest Day (SSOT): rest is a function of weekend / explicit PTO /
  // applicable public holiday — never of empty calendars alone. Calendar
  // work evidence overrides all three. See _shared/availability/*.
  const availability = classifyAvailability({
    now: opts?.now ?? new Date(),
    userHomeCountry: opts?.userHomeCountry ?? null,
    userCurrentCountry: opts?.userCurrentCountry ?? null,
    explicitPto: opts?.explicitPto === true,
    calendarLoad: (calendarLoad as any) ?? null,
    events: events.map((e: any) => ({
      title: String(e?.title || ''),
      startTime: String(e?.startTime || e?.start_time || ''),
      endTime: String(e?.endTime || e?.end_time || e?.startTime || ''),
      isAllDay: e?.isAllDay === true || e?.is_all_day === true,
      isOrganizer: e?.isOrganizer === true || e?.is_organizer === true,
      attendeesCount: Number(e?.attendeesCount ?? e?.attendees_count ?? 0) || 0,
      source: e?.source ?? e?.calendarName ?? null,
      calendarSummary: e?.calendarSummary ?? e?.calendar_summary ?? null,
    })),
  });
  const hasRestSignals = availability.isRestDay;
  try {
    console.info('[generate-mastery-plan][availability-classified]', {
      state: availability.state,
      isRestDay: availability.isRestDay,
      reason: availability.reason,
      meetingCount: availability.workEvidence.meetingCount,
      holiday: availability.holiday,
    });
  } catch { /* logging is best-effort */ }
  return { hasTravelDay, hasConferenceDay, hasOffsiteDay, hasRestSignals };
}

export interface LedgerAllocatorContext {
  nowMs: number;
  rankedCandidates: RankedJitCandidate[];
  hasTravelDay: boolean;
  hasConferenceDay: boolean;
  hasOffsiteDay: boolean;
  hasRestSignals: boolean;
}

export function mergeWithLedger(
  freshModules: HorizonModule[],
  ledgerModules: HorizonModule[],
  completedIds: Set<string>,
  calendarEventIds: Set<string>,
  calendarEventTitles: Set<string>,
  userEdits?: PlanLedger['userEdits'],
  calendarEventTitleById?: Map<string, string>,
  allocatorContext?: LedgerAllocatorContext,
): {
  modules: HorizonModule[];
  source: 'fresh' | 'ledger-evolution' | 'bonus-round';
  carriedSlots: number;
  anchoredSlots: number;
  completedSlots: number;
  victoryLine?: string;
} {
  // No ledger yet → today's first build. Plain fresh.
  if (!ledgerModules || ledgerModules.length === 0) {
    return {
      modules: freshModules.slice(0, 3),
      source: 'fresh',
      carriedSlots: 0,
      anchoredSlots: 0,
      completedSlots: 0,
    };
  }

  const ledgerCompleted = ledgerModules.filter(s => isSlotCompleted(s, completedIds)).length;

  // Bonus Round — every ledger slot is done. Hand off to a brand-new plan and
  // attach a victory line. New JIT events that materialised since the ledger
  // was written are naturally captured because freshModules already reflects
  // current calendar state.
  if (ledgerCompleted >= ledgerModules.length && ledgerModules.length > 0) {
    return {
      modules: freshModules.slice(0, 3),
      source: 'bonus-round',
      carriedSlots: 0,
      anchoredSlots: 0,
      completedSlots: ledgerCompleted,
      victoryLine: `${ledgerCompleted}/${ledgerModules.length} complete. Bonus priorities to keep momentum.`,
    };
  }

  // Otherwise: evolve the ledger.
  const out: HorizonModule[] = [];
  let carriedSlots = 0;
  let anchoredSlots = 0;
  const usedFreshIndexes = new Set<number>();
  // Sprint 2 (Phase 3): track per-slot origin so the allocator identity
  // override only touches slots that are eligible for a context refresh
  // (unfinished/current/future). Sticky slots — completed, user-anchored,
  // or ledger anchor-stability carry — keep their persisted identity.
  const slotOrigins: Array<'sticky' | 'refreshed'> = [];

  // Index fresh slots by JIT event title for anchor refresh lookups.
  const freshByJitTitle = new Map<string, { slot: HorizonModule; idx: number }>();
  freshModules.forEach((m, i) => {
    if (m.isJit && m.jitEventTitle) {
      freshByJitTitle.set(String(m.jitEventTitle).trim(), { slot: m, idx: i });
    }
  });

  const slotEditsMap = userEdits?.slotEdits || {};
  const titleById = calendarEventTitleById || new Map<string, string>();

  const findFreshByEventId = (eventId: string): { slot: HorizonModule; idx: number } | null => {
    const exactByAnchorIdx = freshModules.findIndex((m, i) =>
      !usedFreshIndexes.has(i) && String(m.anchorEventId || '') === String(eventId),
    );
    if (exactByAnchorIdx >= 0) {
      return { slot: freshModules[exactByAnchorIdx], idx: exactByAnchorIdx };
    }
    const title = (titleById.get(eventId) || '').trim();
    if (!title) return null;
    const exact = freshByJitTitle.get(title);
    if (exact && !usedFreshIndexes.has(exact.idx)) return exact;
    for (const [t, v] of freshByJitTitle.entries()) {
      if (usedFreshIndexes.has(v.idx)) continue;
      const a = t.toLowerCase(); const b = title.toLowerCase();
      if (a.includes(b) || b.includes(a)) return v;
    }
    return null;
  };

  for (let slotIndex = 0; slotIndex < ledgerModules.length && slotIndex < 3; slotIndex++) {
    const ledgerSlot = ledgerModules[slotIndex];
    const edit = slotEditsMap[`slot-${slotIndex}`];
    const slotCancelled = edit?.cancelled === true || ledgerSlot.isCancelled === true;
    const replacementEventId =
      (edit?.replacementEventIds && edit.replacementEventIds[0]) ||
      (ledgerSlot.replacementEventIds && ledgerSlot.replacementEventIds[0]) ||
      null;

    // Rule 1: Sticky completion — completed slots stay verbatim.
    if (isSlotCompleted(ledgerSlot, completedIds)) {
      out.push({ ...ledgerSlot });
      carriedSlots++;
      slotOrigins.push('sticky');
      continue;
    }

    // Rule 2: JIT anchor — if the calendar event still exists today, keep
    // slot identity but allow practices/whyLine to refresh from a matching
    // fresh slot (so morning "Strategic Sharpness" can become afternoon
    // "Calm & Grounding" for the SAME board meeting).
    const jitTitle = ledgerSlot.jitEventTitle ? String(ledgerSlot.jitEventTitle).trim() : null;
    const eventStillExists = !!(jitTitle && (
      calendarEventTitles.has(jitTitle) ||
      // Loose match: title may have been truncated/normalised differently
      Array.from(calendarEventTitles).some(t => t.toLowerCase().includes(jitTitle.toLowerCase()) ||
                                                 jitTitle.toLowerCase().includes(t.toLowerCase()))
    ));

    if (ledgerSlot.isJit && eventStillExists && jitTitle) {
      const matchingFresh = freshByJitTitle.get(jitTitle) ||
        Array.from(freshByJitTitle.entries()).find(([title]) =>
          title.toLowerCase().includes(jitTitle.toLowerCase()) ||
          jitTitle.toLowerCase().includes(title.toLowerCase())
        )?.[1];

      if (matchingFresh) {
        usedFreshIndexes.add(matchingFresh.idx);
          out.push({
          ...ledgerSlot,
          // Anchor identity from ledger:
          horizon: ledgerSlot.horizon,
          isJit: true,
          jitEventTitle: ledgerSlot.jitEventTitle,
          jitMinutesUntil: matchingFresh.slot.jitMinutesUntil ?? ledgerSlot.jitMinutesUntil,
          showPriorityPill: true,
          showNavyBorder: matchingFresh.slot.showNavyBorder,
          showPulse: matchingFresh.slot.showPulse,
          // Adaptive content from fresh slot:
          timeLabel: matchingFresh.slot.timeLabel,
          typeLabel: matchingFresh.slot.typeLabel,
          whyLine: matchingFresh.slot.whyLine,
          practice: matchingFresh.slot.practice,
          practices: matchingFresh.slot.practices,
          sequenceReasoning: matchingFresh.slot.sequenceReasoning,
          priorityTag: ledgerSlot.priorityTag ?? null,
          relationshipTag: ledgerSlot.relationshipTag ?? null,
          replacementEventIds: ledgerSlot.replacementEventIds || [],
        });
        anchoredSlots++;
        slotOrigins.push('refreshed');
        continue;
      }
      // No matching fresh slot but the event still exists — keep ledger as-is.
      out.push({ ...ledgerSlot });
      anchoredSlots++;
      slotOrigins.push('sticky');
      continue;
    }

    // Rule 3a: Per-slot replacement — user chose a specific calendar event
    // to anchor THIS slot. Runs BEFORE the cancelled/stability check so a
    // freshly-replaced slot (where userEdit.cancelled was flipped back to
    // false) doesn't get pinned to its pre-replacement ledger content.
    if (replacementEventId) {
      const match = findFreshByEventId(replacementEventId);
      if (match) {
        usedFreshIndexes.add(match.idx);
        out.push({
          ...match.slot,
          isCancelled: false,
          cancelReason: null,
          replacementEventIds: [replacementEventId],
          priorityTag: ledgerSlot.priorityTag ?? null,
          relationshipTag: ledgerSlot.relationshipTag ?? null,
        });
        anchoredSlots++;
        slotOrigins.push('refreshed');
        continue;
      }
      // Fall through to generic recompute if we couldn't find a match.
    }

    // Rule 3b: Anchor stability — non-cancelled, non-completed ledger slot.
    // Keep its content as-is so replacing one priority never reshuffles the
    // others. Only cancelled slots ever get recomputed from fresh.
    if (!slotCancelled) {
      out.push({ ...ledgerSlot });
      carriedSlots++;
      slotOrigins.push('sticky');
      continue;
    }

    // Rule 3c: Cancelled slot without an explicit replacement — pick the
    // next unused fresh slot (preferring same horizon).
    const sameHorizonFreshIdx = freshModules.findIndex((m, i) =>
      !usedFreshIndexes.has(i) && m.horizon === ledgerSlot.horizon
    );
    const fallbackFreshIdx = freshModules.findIndex((_, i) => !usedFreshIndexes.has(i));
    const pickIdx = sameHorizonFreshIdx >= 0 ? sameHorizonFreshIdx : fallbackFreshIdx;

    if (pickIdx >= 0) {
      usedFreshIndexes.add(pickIdx);
      out.push({
        ...freshModules[pickIdx],
        isCancelled: ledgerSlot.isCancelled ?? undefined,
        cancelReason: ledgerSlot.cancelReason ?? null,
        replacementEventIds: ledgerSlot.replacementEventIds || [],
        priorityTag: ledgerSlot.priorityTag ?? null,
        relationshipTag: ledgerSlot.relationshipTag ?? null,
      });
      slotOrigins.push('refreshed');
    } else {
      // No fresh content available — keep ledger slot.
      out.push({ ...ledgerSlot });
      carriedSlots++;
      slotOrigins.push('sticky');
    }
  }

  // If ledger had < 3 slots (rare), top up from any unused fresh slot.
  while (out.length < 3) {
    const nextIdx = freshModules.findIndex((_, i) => !usedFreshIndexes.has(i));
    if (nextIdx < 0) break;
    usedFreshIndexes.add(nextIdx);
    out.push(freshModules[nextIdx]);
    slotOrigins.push('refreshed');
  }

  // Sprint 2 (Phase 3): allocator now receives the REAL current-window
  // context (real ranked candidates + real day-shape flags + current nowMs)
  // — the same inputs used by the fresh-generation path. This fixes the
  // afternoon/evening degradation where the ledger-evolution path was
  // fabricating score:0 pseudo-candidates with hardcoded structural flags.
  //
  // Fallback: if a caller did not pass an allocatorContext (older test
  // path only), fall back to the legacy pseudo-candidate reconstruction
  // so we never hard-crash.
  const effectiveAllocatorContext: LedgerAllocatorContext = allocatorContext ?? {
    nowMs: Date.now(),
    rankedCandidates: freshModules.map((m, idx) => ({
      eventId: String(m.anchorEventId || m.jitEventTitle || idx),
      title: m.jitEventTitle || m.timeLabel || '',
      categoryId: (m.anchorCategoryId as any) ?? null,
      phase: (m.jitPhase as any) ?? null,
      comboKey: null as any,
      score: 0,
      importance: 0,
      components: null as any,
      event: { id: String(m.anchorEventId || idx), title: m.jitEventTitle || m.timeLabel || '', start_time: '', end_time: '' },
    })) as any,
    hasTravelDay: false,
    hasConferenceDay: false,
    hasOffsiteDay: false,
    hasRestSignals: false,
  };

  const allocation = allocatePlanSlots({
    nowMs: effectiveAllocatorContext.nowMs,
    rankedCandidates: effectiveAllocatorContext.rankedCandidates,
    hasTravelDay: effectiveAllocatorContext.hasTravelDay,
    hasConferenceDay: effectiveAllocatorContext.hasConferenceDay,
    hasOffsiteDay: effectiveAllocatorContext.hasOffsiteDay,
    hasRestSignals: effectiveAllocatorContext.hasRestSignals,
  });

  // Sprint 2 (Phase 3): allocator identity STILL wins (Sprint 1 rule) — but
  // only for slots whose origin is 'refreshed' (unfinished / current /
  // future). Sticky slots (completed, user-anchored ledger carry) keep
  // their persisted identity intact so replacing one priority never
  // reshuffles a completed win. dayShape / mode are informational and
  // still applied globally.
  let refreshedSlotCount = 0;
  let carriedSlotCount = 0;
  const annotated = out.slice(0, 3).map((m, idx) => {
    const origin = slotOrigins[idx] ?? 'refreshed';
    if (origin === 'sticky') {
      carriedSlotCount++;
      return {
        ...m,
        mode: allocation.mode,
        dayShape: allocation.dayShape,
        slotAllocationDebug: allocation.debug,
      };
    }
    refreshedSlotCount++;
    const a = allocation.slots[idx];
    const merged: any = {
      ...m,
      mode: allocation.mode,
      dayShape: allocation.dayShape,
      slotAllocationDebug: allocation.debug,
      slotRole: a?.slotRole ?? (m as any).slotRole,
      allocationReason: a?.allocationReason ?? (m as any).allocationReason,
      arcLabel: a?.arcLabel ?? m.arcLabel ?? undefined,
      jitPhase: a?.jitPhase ?? m.jitPhase ?? null,
      jitEventTitle: a?.jitEventTitle ?? m.jitEventTitle ?? null,
    };
    if (a && a.jitPhase == null && a.jitEventTitle == null) {
      merged.isJit = false;
      merged.anchorEventId = null;
      merged.anchorCategoryId = null;
    } else if (a?.jitEventId) {
      merged.anchorEventId = a.jitEventId;
      merged.anchorCategoryId = a.jitCategoryId ?? (m as any).anchorCategoryId ?? null;
    }
    return merged;
  });
  try {
    console.info('[generate-mastery-plan][ledger-evolution-context]', {
      hasTravelDay: effectiveAllocatorContext.hasTravelDay,
      hasConferenceDay: effectiveAllocatorContext.hasConferenceDay,
      hasOffsiteDay: effectiveAllocatorContext.hasOffsiteDay,
      hasRestSignals: effectiveAllocatorContext.hasRestSignals,
      rankedCandidateCount: effectiveAllocatorContext.rankedCandidates.length,
      dayShape: allocation.dayShape,
      mode: allocation.mode,
      carriedSlotCount,
      refreshedSlotCount,
      usedFallbackContext: !allocatorContext,
    });
    console.info('[generate-mastery-plan][slot-allocation-final]', {
      source: 'ledger-evolution',
      dayShape: allocation.dayShape,
      mode: allocation.mode,
      slots: annotated.map((m: any, idx: number) => ({
        idx,
        origin: slotOrigins[idx] ?? 'refreshed',
        allocatorPhase: allocation.slots[idx]?.jitPhase ?? null,
        finalPhase: m.jitPhase ?? null,
        allocatorTitle: allocation.slots[idx]?.jitEventTitle ?? null,
        finalTitle: m.jitEventTitle ?? null,
        identityMatched:
          (allocation.slots[idx]?.jitPhase ?? null) === (m.jitPhase ?? null) &&
          (allocation.slots[idx]?.jitEventTitle ?? null) === (m.jitEventTitle ?? null),
        slotRole: m.slotRole,
        allocationReason: m.allocationReason,
      })),
    });
  } catch { /* logging must not break plan */ }

  return {
    modules: annotated,
    source: 'ledger-evolution',
    carriedSlots,
    anchoredSlots,
    completedSlots: ledgerCompleted,
  };
}

// ==================== HANDLER ====================

if (import.meta.main) Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let userId: string | undefined;
  // Phase 3.5 — hoist client locals so the error path can stamp the
  // user's local date/window instead of falling back to UTC.
  let clientTimezoneOffset: number = new Date().getTimezoneOffset();
  let clientLocalDate: string | null = null;
  let currentPeriod: 'morning' | 'afternoon' | 'evening' = getTimeOfDay(clientTimezoneOffset) as any;
  try {
    // Authentication – verify JWT and extract userId
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) {
      const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const authHeader = req.headers.get('Authorization') || '';
      const internalUserId = req.headers.get('x-dev-user-id');
      if (serviceRole && authHeader === `Bearer ${serviceRole}` && internalUserId) {
        userId = internalUserId;
        console.log(`[generate-mastery-plan] service-role orchestrator: userId=${redactUserId(userId)}`);
      } else {
      // DEV_MODE bypass: allow fallback when not in production
      const env = Deno.env.get('ENVIRONMENT') || '';
      if (env !== 'production') {
        const devHeader = req.headers.get('x-dev-user-id');
        if (devHeader) {
          userId = devHeader;
          console.log(`[generate-mastery-plan] DEV bypass: userId=${redactUserId(userId)}`);
        } else {
          return auth.errorResponse;
        }
      } else {
        return auth.errorResponse;
      }
      }
    } else {
      userId = auth.userId;
    }

    // Rate limiting – 30s cooldown per user+state fingerprint (not just period)
    const now = Date.now();
    // Defensive body parse: empty or malformed JSON must not crash the handler.
    // Return 400 with a concise reason instead of a generic 500.
    let body: any = {};
    let rawBodyText = '';
    try {
      rawBodyText = await req.text();
    } catch (readErr: any) {
      console.error('[generate-mastery-plan] request body read failed', {
        contentType: req.headers.get('content-type'),
        userId: redactUserId(userId),
        reason: readErr?.message || String(readErr),
      });
      return new Response(
        JSON.stringify({ error: 'Invalid request body', reason: 'Unable to read request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const contentType = req.headers.get('content-type') || '';
    const bodyIsEmpty = !rawBodyText || rawBodyText.trim().length === 0;
    const requestMode = req.headers.get('x-request-mode') || 'default';
    const caller = req.headers.get('x-plan-caller') || req.headers.get('x-client-path') || 'unknown';

    console.log('[generate-mastery-plan][request-body]', {
      contentType,
      contentLength: req.headers.get('content-length'),
      rawBodyLength: rawBodyText.length,
      bodyEmpty: bodyIsEmpty,
      userId: redactUserId(userId),
      requestMode,
      caller,
      hasAuthHeader: !!req.headers.get('authorization'),
      hasDevUserHeader: !!req.headers.get('x-dev-user-id'),
      hasImpersonationHeader: !!req.headers.get('x-impersonation-token'),
    });

    if (bodyIsEmpty) {
      console.warn('[generate-mastery-plan] request body missing; defaulting to empty object', {
        contentType,
        bodyEmpty: true,
        userId: redactUserId(userId),
        requestMode,
        caller,
      });
      body = {};
    } else {
      try {
        body = JSON.parse(rawBodyText);
      } catch (parseErr: any) {
        console.error('[generate-mastery-plan] request body parse failed', {
          contentType,
          bodyEmpty: false,
          userId: redactUserId(userId),
          requestMode,
          caller,
          reason: parseErr?.message || String(parseErr),
        });
        return new Response(
          JSON.stringify({ error: 'Invalid request body', reason: 'Malformed JSON' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      console.error('[generate-mastery-plan] request body invalid shape', {
        contentType,
        bodyEmpty: false,
        userId: redactUserId(userId),
        requestMode,
        caller,
      });
      return new Response(
        JSON.stringify({ error: 'Invalid request body', reason: 'Expected JSON object' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    clientTimezoneOffset = body.timezoneOffset ?? new Date().getTimezoneOffset();
    clientLocalDate = typeof body.localDate === 'string' ? body.localDate : null;
    const todayCheckinId = typeof body.todayCheckinId === 'string' ? body.todayCheckinId : null;
    const selectedCalendarEventIds = Array.isArray(body.selectedCalendarEventIds)
      ? body.selectedCalendarEventIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : [];
    // Per-slot replacement contract (preferred). Each entry binds one event
    // to one slot index. Validated/normalised here; downstream code keys on
    // string slot indexes "0" | "1" | "2".
    const slotReplacements: Record<string, { eventId: string }> = {};
    if (body.slotReplacements && typeof body.slotReplacements === 'object') {
      for (const [k, v] of Object.entries(body.slotReplacements)) {
        const idx = Number(k);
        const eventId = (v as any)?.eventId;
        if (Number.isInteger(idx) && idx >= 0 && idx <= 2 && typeof eventId === 'string' && eventId.length > 0) {
          slotReplacements[String(idx)] = { eventId };
        }
      }
    }
    const forceRefresh = body.forceRefresh === true;
    const outerReadinessCache = body.outerReadinessCache ?? null;
    // F1 — accept an explicit target window from the caller. Executive
    // Home orchestrator (`build-executive-home-cards`) sends `mrsWindow`;
    // accept `timeWindow` too for symmetry with other Executive Home
    // callers. Fall back to wall-clock only for legacy callers that never
    // set either.
    const requestedWindowRaw =
      typeof body.mrsWindow === 'string' ? body.mrsWindow :
      typeof body.timeWindow === 'string' ? body.timeWindow :
      null;
    const requestedWindow =
      requestedWindowRaw === 'morning' ||
      requestedWindowRaw === 'afternoon' ||
      requestedWindowRaw === 'evening'
        ? requestedWindowRaw
        : null;
    const strictBriefHandshake = body.strictBriefHandshake === true;
    currentPeriod = (requestedWindow ?? getTimeOfDay(clientTimezoneOffset)) as any;
    console.log('[generate-mastery-plan][window-resolve]', {
      requestedWindow,
      derivedFromClock: requestedWindow ? null : currentPeriod,
      strictBriefHandshake,
      caller,
    });

    // Build state fingerprint from latest check-in + completions for cache key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const platform = detectClientPlatform(req);
    const supabaseClient = wrapDbWithCalendarPrimacy(
      createClient(supabaseUrl, supabaseKey),
      platform,
    );

    // Phase 3.5 — shared snapshot persister. Used by both the success path
    // and the rate-limit cache-hit path so a missing snapshot row gets
    // backfilled even when we return a cached response.
    const persistMasteryPlanSnapshot = async (
      planObj: any,
      opts: { onlyIfMissing?: boolean } = {},
    ) => {
      try {
        const planDate = clientLocalDate || getLocalDateISO(clientTimezoneOffset);
        const horizonMods = Array.isArray(planObj?.horizonModules)
          ? planObj.horizonModules
          : [];
        // Executive Home's "Today's Performance Priorities" card renders from
        // `horizonModules`, not `timeOfDayPlan.modules`. Persist the snapshot
        // `priorities` projection from the same horizon source so a `ready`
        // row cannot claim priorities exist while `horizon_modules` is empty.
        const visiblePriorities = horizonMods;
        const timeOfDayModules = Array.isArray(planObj?.timeOfDayPlan?.modules)
          ? planObj.timeOfDayPlan.modules
          : [];
        // Sprint 4 (Phase 6): a truthful rest_day carries zero horizon
        // modules by design. Treat it as a valid payload so the snapshot
        // lands as `ready`, not `awaiting`.
        const isRestDayPayload =
          planObj?.meta?.restDay === true ||
          planObj?.meta?.dayShape === 'rest_day' ||
          planObj?.restDay === true;
        const hasPayload =
          visiblePriorities.length > 0 ||
          timeOfDayModules.length > 0 ||
          isRestDayPayload;
        // F3 — snapshot status contract:
        //   'ready'    → hasPayload AND plan is not an awaiting envelope
        //   'awaiting' → plan is an awaiting envelope OR payload absent
        //               while readiness signals are still missing
        //   'error'    → written by the outer catch below only
        const planIsAwaiting =
          planObj?.planState === 'awaiting_signals' ||
          planObj?.awaitingSignals === true;
        const snapshotStatus: 'ready' | 'awaiting' =
          (!planIsAwaiting && hasPayload) ? 'ready' : 'awaiting';
        console.log('[mastery-plan-snapshot][persist-start]', {
          userId: redactUserId(userId!),
          planDate,
          window: currentPeriod,
          onlyIfMissing: !!opts.onlyIfMissing,
          requestMrsAwaiting: (typeof requestMrsAwaiting !== 'undefined') ? requestMrsAwaiting : null,
          hasPayload,
          planIsAwaiting,
          snapshotStatus,
          prioritiesCount: visiblePriorities.length,
          horizonModulesCount: horizonMods.length,
          timeOfDayModulesCount: timeOfDayModules.length,
        });
        // Non-rest-day plan resolved to zero horizon modules — this is a
        // silent bug class (a `ready`-equivalent UX with an empty slot
        // payload). Log a structured warning so downstream telemetry can
        // detect and attribute the exact reason path.
        if (
          !isRestDayPayload &&
          !planIsAwaiting &&
          horizonMods.length === 0
        ) {
          console.warn('[mastery-plan-snapshot][non-rest-day-empty-payload]', {
            userId: redactUserId(userId!),
            planDate,
            window: currentPeriod,
            resolvedStatus: snapshotStatus,
            hasPayload,
            planIsAwaiting,
            isRestDayPayload,
            planState: (planObj as any)?.planState ?? null,
            planReason: (planObj as any)?.reason ?? null,
            dayShape: (planObj as any)?.meta?.dayShape ?? null,
            dayKind: (planObj as any)?.meta?.dayKind ?? (planObj as any)?.dayKind ?? null,
            timeOfDayModulesCount: timeOfDayModules.length,
            hasPlanJson: !!planObj,
          });
        }
        // F3 — awaiting rows are ALWAYS persisted so the reader can
        // return a truthful awaiting state. They land with status='awaiting'
        // and never shadow a ready row (see error-path guard below and the
        // reader's precedence rules).
        if (opts.onlyIfMissing) {
          const { data: existing } = await supabaseClient
            .from('mastery_plan_snapshots')
            .select('id')
            .eq('user_id', userId!)
            .eq('plan_date', planDate)
            .eq('mrs_window', currentPeriod)
            .maybeSingle();
          if (existing?.id) {
            console.log('[mastery-plan-snapshot][early-return]', {
              reason: 'only_if_missing_row_exists',
              existingId: existing.id,
            });
            return;
          }
        }
        // F3 — never let an awaiting write clobber an existing ready row
        // for the same (user, plan_date, mrs_window). The reader also
        // prefers ready, but keeping the ready row on disk means a
        // downstream consumer (Smart Nudges, insights) doesn't briefly
        // see the awaiting state either.
        if (snapshotStatus === 'awaiting') {
          const { data: existingReady } = await supabaseClient
            .from('mastery_plan_snapshots')
            .select('id')
            .eq('user_id', userId!)
            .eq('plan_date', planDate)
            .eq('mrs_window', currentPeriod)
            .eq('status', 'ready')
            .maybeSingle();
          if (existingReady?.id) {
            console.log('[mastery-plan-snapshot][awaiting-preserved-ready]', {
              userId: redactUserId(userId!),
              planDate,
              window: currentPeriod,
              existingReadyId: existingReady.id,
            });
            return;
          }
        }
        // Plans are now context-aware per window. Each (user, plan_date,
        // mrs_window) is written independently — morning does not shadow
        // afternoon or evening. Overwrite protection lives at the
        // window-key level via the unique constraint + `onConflict`, and
        // the error path (below) refuses to clobber an existing ready
        // row for the same window.
        const practiceIds: string[] = Array.from(new Set([
          ...visiblePriorities.map((m: any) => m?.content?.id ?? m?.contentId ?? m?.id).filter((v: any) => typeof v === 'string'),
          ...horizonMods.map((m: any) => m?.content?.id ?? m?.contentId ?? m?.id).filter((v: any) => typeof v === 'string'),
        ]));

        // Compute an actual ISO horizon timestamp. Day-of plans cover the
        // next 24h; week-ahead plans cover `lookaheadDays`. If nothing is
        // available, store NULL — never the mode string.
        let horizonIsoValue: string | null = null;
        try {
          const wad = planObj?.weekAheadDecision;
          const lookaheadDays = typeof wad?.lookaheadDays === 'number' && wad.lookaheadDays > 0
            ? wad.lookaheadDays
            : null;
          if (wad?.active && lookaheadDays) {
            horizonIsoValue = new Date(Date.now() + lookaheadDays * 86_400_000).toISOString();
          } else {
            horizonIsoValue = new Date(Date.now() + DAY_OF_HORIZON_MS).toISOString();
          }
        } catch (_) { horizonIsoValue = null; }

        let planLedger: any = null;
        try {
          const { data: ledgerRow } = await supabaseClient
            .from('daily_ritual_completions')
            .select('plan_ledger')
            .eq('user_id', userId!)
            .eq('ritual_date', planDate)
            .eq('session_period', currentPeriod)
            .maybeSingle();
          planLedger = (ledgerRow as any)?.plan_ledger ?? null;
        } catch (_) { /* non-fatal */ }

        console.log('[mastery-plan-snapshot][payload-details]', {
          userId: redactUserId(userId!),
          planDate,
          window: currentPeriod,
          horizonModulesCount: horizonMods.length,
          prioritiesCount: visiblePriorities.length,
          timeOfDayModulesCount: timeOfDayModules.length,
          recommendedPracticeIds: practiceIds,
          hasPlanLedger: !!planLedger,
          horizonIso: horizonIsoValue,
          status: snapshotStatus,
        });
        const { data: upserted, error: snapErr } = await supabaseClient
          .from('mastery_plan_snapshots')
          .upsert({
            user_id: userId!,
            plan_date: planDate,
            mrs_window: currentPeriod,
            day_kind: planObj?.meta?.dayKind ?? planObj?.dayKind ?? null,
            horizon_iso: horizonIsoValue,
            plan_json: planObj,
            horizon_modules: horizonMods,
            priorities: visiblePriorities,
            recommended_practice_ids: practiceIds,
            plan_ledger: planLedger,
            // brief_snapshot_id intentionally null — generate-mastery-plan
            // does not receive a briefId today; populate when the contract
            // surfaces one rather than inventing a value.
            brief_snapshot_id: null,
            input_signature: stateFingerprint,
            status: snapshotStatus,
            error_json: snapshotStatus === 'awaiting'
              ? {
                  awaitingReason:
                    planObj?.reason ??
                    (planIsAwaiting ? 'awaiting_signals' : 'no_payload'),
                  message: planObj?.message ?? null,
                }
              : null,
            generated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,plan_date,mrs_window' })
          .select('id, status')
          .maybeSingle();
        if (snapErr) {
          console.error('[mastery-plan-snapshot][upsert-failure]', {
            userId: redactUserId(userId!),
            planDate,
            window: currentPeriod,
            error: snapErr.message ?? String(snapErr),
            code: (snapErr as any)?.code ?? null,
            details: (snapErr as any)?.details ?? null,
            hint: (snapErr as any)?.hint ?? null,
          });
        } else {
          console.log('[mastery-plan-snapshot][upsert-success]', {
            userId: redactUserId(userId!),
            planDate,
            window: currentPeriod,
            snapshotId: upserted?.id ?? null,
            status: upserted?.status ?? snapshotStatus,
            prioritiesCount: visiblePriorities.length,
            horizonModulesCount: horizonMods.length,
            timeOfDayModulesCount: timeOfDayModules.length,
            recommendedPracticeIds: practiceIds.length,
          });
        }
      } catch (snapPersistErr) {
        console.error('[mastery-plan-snapshot][upsert-threw]', {
          userId: redactUserId(userId ?? ''),
          window: currentPeriod,
          error: snapPersistErr instanceof Error ? snapPersistErr.message : String(snapPersistErr),
          stack: snapPersistErr instanceof Error ? snapPersistErr.stack : null,
        });
      }
    };

    let stateFingerprint = `${userId}:${currentPeriod}`;
    try {
      const today = clientLocalDate || getLocalDateISO(clientTimezoneOffset);
      let checkinQuery = supabaseClient.from('daily_checkins')
          .select('timestamp, outcome, energy_balance, clarity_level, confidence_level')
          .eq('user_id', userId);

      if (todayCheckinId) {
        checkinQuery = checkinQuery.eq('id', todayCheckinId);
      } else {
        checkinQuery = checkinQuery
          .eq('checkin_date', today)
          .order('timestamp', { ascending: false })
          .limit(1);
      }

      const [checkinSnap, ritualSnap] = await Promise.all([
        checkinQuery.maybeSingle(),
        supabaseClient.from('daily_ritual_completions')
          .select('updated_at, completed_practice_ids')
          .eq('user_id', userId)
          .eq('ritual_date', today)
          .eq('session_period', currentPeriod)
          .maybeSingle(),
      ]);
      const ci = checkinSnap.data;
      const ri = ritualSnap.data;
      stateFingerprint = [
        userId, currentPeriod,
        ci?.timestamp || 'none',
        ci?.outcome || 'none',
        ci?.energy_balance ?? 'none',
        ci?.clarity_level ?? 'none',
        ci?.confidence_level ?? 'none',
        ri?.updated_at || 'none',
        (ri?.completed_practice_ids || []).join(',') || 'none',
      ].join(':');
    } catch { /* fallback to userId:period */ }

    const requestMrsState =
      body.mrsReadinessState === 'baseline' ||
      body.mrsReadinessState === 'refined' ||
      body.mrsReadinessState === 'awaiting'
        ? body.mrsReadinessState
        : null;
    const requestMrsScore = typeof body.mrsReadinessScore === 'number' && Number.isFinite(body.mrsReadinessScore)
      ? body.mrsReadinessScore
      : null;
    const requestMrsAwaiting =
      requestMrsState === 'awaiting' ||
      (requestMrsState != null && requestMrsScore == null) ||
      outerReadinessCache?.awaitingSignals === true ||
      outerReadinessCache?.briefMode === 'cold-start';

    const cached = rateLimitMap.get(stateFingerprint);
    if (!requestMrsAwaiting && !forceRefresh && cached && (now - cached.lastCall) < RATE_LIMIT_COOLDOWN_MS) {
      console.log(`[generate-mastery-plan] Rate limited: ${redactUserId(userId)} fingerprint=${stateFingerprint.substring(0, 60)}... (${Math.round((now - cached.lastCall) / 1000)}s ago)`);
      // Phase 3.5 — backfill snapshot if absent, so a hot cache key never
      // leaves the DB without the most recent assembled payload.
      await persistMasteryPlanSnapshot(cached.cachedResponse, { onlyIfMissing: true });
      return new Response(JSON.stringify(cached.cachedResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Phase 3 — load the CoS Leader Profile once per request. Null-safe;
    // downstream consumers treat missing/failed profiles as "use dynamic
    // behaviour" and never fail on absence.
    let leaderProfile: LeaderProfileContext | undefined;
    try {
      leaderProfile = await loadLeaderProfile(supabaseClient, userId!);
      console.log('[generate-mastery-plan][leader-profile]', {
        userId: redactUserId(userId!),
        status: leaderProfile.meta.status,
        declaredGoalsCount: leaderProfile.goals.declared.length,
        archetype: leaderProfile.analysis.archetype,
        hasVoiceRules: !!leaderProfile.voice.cos_brief_rules,
      });
    } catch (e) {
      console.warn('[generate-mastery-plan][leader-profile] load failed:', e instanceof Error ? e.message : String(e));
    }

    // Only timezoneOffset comes from client – all other signals are server-derived
    const planReq: PlanRequest = {
      userId,
      timezoneOffset: clientTimezoneOffset,
      localDate: clientLocalDate || undefined,
      todayCheckinId,
      selectedCalendarEventIds,
      slotReplacements,
      mrsReadinessState: requestMrsState,
      mrsReadinessScore: requestMrsScore,
      timeWindow: requestedWindow,
      strictBriefHandshake,
      // All below are populated server-side inside generateMasteryPlan
      innerReadinessTier: 'managing',
      innerReadinessScore: 50,
      outerReadinessPhrase: 'Steady execution.',
      outerReadinessDriver: 'state',
      outerReadinessContext: '',
      outerReadinessLeanOn: '',
      outerReadinessWatchFor: '',
      calendarLoad: 'none',
      calendarPressure: 'none',
      favorites: [],
      completedToday: [],
      clarityLevel: 0,
      confidenceLevel: 0,
      checkInOutcome: 'steady',
      calendarEvents: [],
      coachInsights: [],
      effectiveContent: [],
      patternInsight: undefined,
      archetype: '',
      practicePriorityTag: '',
      pressureContextTag: '',
      hasCalendarConnection: false,
      wearableContext: { sleepScore: null, hrvMs: null, restingHR: null, hrvDeviation: null, sleepQuality: null, hasData: false },
      leaderProfile,
    };

    // supabaseClient already created above for fingerprint

    const plan = await generateMasteryPlan(planReq, supabaseClient, outerReadinessCache);

    // Phase 3 — leader-profile observability. Stamp declared goals,
    // archetype and profile status onto the assembled plan payload so
    // `mastery_plan_snapshots.plan_json` carries evidence the CoS
    // profile was read this run. Purely additive; never gates the plan.
    try {
      if (plan && typeof plan === 'object' && leaderProfile) {
        (plan as any).leaderGoals = leaderProfile.goals.declared;
        (plan as any).leaderArchetype = leaderProfile.analysis.archetype;
        (plan as any).leaderProfileStatus = leaderProfile.meta.status;
      }
    } catch (_e) { /* best-effort observability */ }

    // Server-authoritative Week-Ahead decision attached to the response
    // so the frontend never has to guess from day-of-week alone. Saturday
    // returns active:false, Sunday returns active:true (see
    // _shared/plan/week-ahead-mode.ts §17).
    try {
      const _tzOffset = (planReq as any).timezoneOffset ?? clientTimezoneOffset ?? 0;
      const _localNow = new Date(Date.now() - _tzOffset * 60000);
      const _wam = evaluateWeekAheadMode({
        dayOfWeek: _localNow.getUTCDay(),
        localHour: _localNow.getUTCHours(),
        manualOverride: (body as any)?.weekAheadOverride === true
          || req.headers.get('x-week-ahead-override') === '1',
      });
      (plan as any).weekAheadDecision = {
        active: _wam.active,
        reason: _wam.reason,
        lookaheadDays: _wam.lookaheadDays,
        mode: _wam.active ? 'week_ahead' : 'day_of',
      };
    } catch (_e) {
      // Non-fatal — frontend falls back to local DoW heuristic.
    }

    // Cache response for rate limiting
    rateLimitMap.set(stateFingerprint, { lastCall: now, cachedResponse: plan });
    // Evict stale entries (prevent memory leak)
    if (rateLimitMap.size > 500) {
      for (const [key, val] of rateLimitMap) {
        if (now - val.lastCall > RATE_LIMIT_COOLDOWN_MS * 2) rateLimitMap.delete(key);
      }
    }

    // Phase 3 — persist the full day-of Plan payload. Uses the shared
    // helper so success and cache-hit paths agree on shape.
    await persistMasteryPlanSnapshot(plan);

    return new Response(JSON.stringify(plan), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (error: any) {
    console.error('[generate-mastery-plan] Fatal error:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      userId: userId ?? 'unknown',
    });
    // Phase 3.5 — best-effort error snapshot using the user's local
    // date/window (hoisted above the try). Falls back to UTC only if the
    // client never reached the body-parse step.
    try {
      const _url = Deno.env.get('SUPABASE_URL');
      const _key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (userId && _url && _key) {
        const _sb = createClient(_url, _key);
        const _planDate = clientLocalDate || getLocalDateISO(clientTimezoneOffset);
        const _period = currentPeriod;
        // Overwrite protection: never clobber a valid ready snapshot for
        // this (user, date, window) with an error row. If a ready row
        // exists, the UI keeps rendering it and the error is captured in
        // logs / `executive_home_card_runs`.
        const { data: existingReady } = await _sb
          .from('mastery_plan_snapshots')
          .select('id')
          .eq('user_id', userId)
          .eq('plan_date', _planDate)
          .eq('mrs_window', _period)
          .eq('status', 'ready')
          .maybeSingle();
        if (!existingReady?.id) {
          await _sb.from('mastery_plan_snapshots').upsert({
            user_id: userId,
            plan_date: _planDate,
            mrs_window: _period,
            status: 'error',
            error_json: { message: error?.message ?? String(error), name: error?.name ?? null },
            generated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,plan_date,mrs_window' });
        } else {
          console.log('[mastery-plan-snapshot][error-preserved-ready]', {
            planDate: _planDate,
            window: _period,
            existingReadyId: existingReady.id,
          });
        }
      }
    } catch (_errSnapErr) { /* swallow */ }
    return new Response(JSON.stringify({ error: 'Plan generation failed', reason: error?.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
