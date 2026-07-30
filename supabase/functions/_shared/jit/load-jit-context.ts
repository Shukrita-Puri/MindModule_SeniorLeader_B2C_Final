/**
 * load-jit-context.ts — shared loader that turns calendar_events rows into
 * `SelectInputEvent[]` + `SelectContext` ready for `selectJitCandidates`.
 *
 * This is the canonical wiring used by surfaces that need the triangulated
 * Immediate / Tactical / Strategic + Sovereign + Memory ranking. It mirrors
 * the inline loader in `generate-mastery-plan/index.ts` (which is the
 * historical source of truth) without firing the optional async attendee
 * resolver — week-ahead callers should rely on whatever the proactive
 * post-sync hook has already cached.
 *
 * Pure read-only; never writes. Safe to call from any edge function.
 */

// deno-lint-ignore-file no-explicit-any

import type { SelectInputEvent, SelectContext } from "./select-jit.ts";
import {
  isGenericDomain,
  inferRoleFromDomain,
  type AttendeeRoleSignal,
  type ResolvedRole,
  type RoleSource,
} from "./relationship-weights.ts";
import type { RelationshipRole } from "./relationship-taxonomy.ts";
import {
  applyEventPriorityMemory,
  loadPriorityMemoryForUser,
  normalizeEventTitleMemoryKey,
  TITLE_SPECIFIC_MEMORY_CATEGORY,
} from "../plan/event-priority-memory.ts";
import {
  normalizeEventTypeKey,
} from "../plan/week-ahead-mode.ts";
import { coarseEventType } from "../events/event-classifier.ts";

/** Minimum shape the loader needs from each calendar_events row. */
export interface JitContextCalendarRow {
  id: string;
  title: string;
  start_time: string;
  end_time?: string | null;
  created_at?: string | null;
  provider?: string | null;
  attendees_count?: number | null;
  is_organizer?: boolean | null;
  /** Either the full event_metadata jsonb or just attendeeSignals. */
  event_metadata?: Record<string, any> | null;
}

export interface LoadJitContextOptions {
  /** Account age in days; defaults to a fresh query against profiles. */
  accountAgeDays?: number;
  /** Lookback window for sovereign tag + memory rows. Default 90 days. */
  memoryLookbackDays?: number;
  /** User goals snapshot. If omitted, an empty goal set is used. */
  goals?: SelectContext["goals"];
  /** Override now for tests. */
  nowMs?: number;
}

export interface LoadedJitContext {
  input: SelectInputEvent[];
  ctx: SelectContext;
}

const RELATIONSHIP_TAG_TO_ROLE: Record<string, RelationshipRole> = {
  boss: "direct_boss",
  board: "board_member",
  client: "client",
  customer: "customer",
  vendor: "vendor",
  team: "report_direct",
  junior: "report_junior",
  colleague: "peer",
  investor: "investor",
  leadership: "skip_level",
};

function extractAttendeeEmails(row: JitContextCalendarRow): {
  emails: string[];
  organizerEmail: string | null;
} {
  const meta = row.event_metadata ?? {};
  const signals = (meta?.attendeeSignals ?? meta) as any;
  const attendees = Array.isArray(signals?.attendees) ? signals.attendees : [];
  const out: string[] = [];
  for (const a of attendees) {
    const em = typeof a === "string" ? a : a?.email;
    if (typeof em === "string" && em.includes("@")) {
      out.push(em.toLowerCase().trim());
    }
  }
  const orgRaw = signals?.organizer?.email ?? meta?.organizer_email ?? null;
  const organizerEmail = typeof orgRaw === "string" && orgRaw.includes("@")
    ? orgRaw.toLowerCase().trim()
    : null;
  return { emails: out, organizerEmail };
}

/**
 * Build the full SelectInputEvent[] + SelectContext pair for a list of
 * calendar events. Pulls attendee_relationships (with memory replay +
 * domain fallback), event_priority_memory (sovereign tags + derived
 * delta), causality_findings.signal_summary, and the user's own email
 * domain. No-ops gracefully when any individual table is empty.
 */
export async function loadJitContextForEvents(
  supabase: any,
  userId: string,
  events: JitContextCalendarRow[],
  opts: LoadJitContextOptions = {},
): Promise<LoadedJitContext> {
  const memoryLookbackDays = opts.memoryLookbackDays ?? 90;

  // ── 1. Own domain ───────────────────────────────────────────────────
  let userOwnDomain: string | null = null;
  let accountAgeDays = opts.accountAgeDays ?? 0;
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("email, created_at")
      .eq("id", userId)
      .maybeSingle();
    const em = (prof as any)?.email;
    if (typeof em === "string") {
      const at = em.lastIndexOf("@");
      if (at >= 0) userOwnDomain = em.slice(at + 1).toLowerCase().trim();
    }
    if (!opts.accountAgeDays && (prof as any)?.created_at) {
      accountAgeDays = Math.floor(
        (Date.now() - new Date((prof as any).created_at).getTime()) / 86_400_000,
      );
    }
  } catch (_e) { /* optional */ }

  // ── 2. Collect attendees per event ──────────────────────────────────
  const allEmails = new Set<string>();
  const attendeesByEventId = new Map<string, string[]>();
  const organizerByEventId = new Map<string, string | null>();
  const attendeeDomainsByEventId = new Map<string, string[]>();
  for (const ev of events) {
    if (!ev?.id || !ev?.title) continue;
    const { emails, organizerEmail } = extractAttendeeEmails(ev);
    attendeesByEventId.set(ev.id, emails);
    organizerByEventId.set(ev.id, organizerEmail);
    const domains: string[] = [];
    for (const em of emails) {
      allEmails.add(em);
      const at = em.lastIndexOf("@");
      if (at >= 0) domains.push(em.slice(at + 1));
    }
    attendeeDomainsByEventId.set(ev.id, domains);
  }

  // ── 3. attendee_relationships (cached LLM + user_tag rows) ──────────
  const signalByEmail = new Map<string, AttendeeRoleSignal>();
  if (allEmails.size > 0) {
    try {
      const { data } = await supabase
        .from("attendee_relationships")
        .select("attendee_email, role, source, confidence, expires_at")
        .eq("user_id", userId)
        .in("attendee_email", Array.from(allEmails));
      for (const r of (data ?? []) as any[]) {
        if (r?.expires_at && new Date(r.expires_at).getTime() < Date.now()) continue;
        const src = (r.source as string | null);
        const source: RoleSource = src === "user_tag" ? "user_tag" : "llm";
        signalByEmail.set(r.attendee_email, {
          role: (r.role as ResolvedRole) || "unknown",
          source,
          confidence: source === "user_tag" ? 1 : (typeof r.confidence === "number" ? r.confidence : null),
        });
      }
    } catch (_e) { /* fall through */ }
  }

  // ── 4. event_priority_memory: sovereign tags + relationship replay +
  //       derived memoryDelta. One query, three projections.
  const sovereignTagsByEventId = new Map<string, string[]>();
  const memoryDeltaByEventId: SelectContext["memoryDeltaByEventId"] = {};
  const eventIds = events.map((e) => e?.id).filter((id): id is string => typeof id === "string" && !!id);
  // Build (category, type_key) lookups for both event-id rows AND legacy
  // rows keyed by category/type only.
  const legacyKeysByEventId = new Map<string, { eventCategory: string; eventTypeKey: string }>();
  for (const ev of events) {
    if (!ev?.id || !ev?.title) continue;
    legacyKeysByEventId.set(ev.id, {
      eventCategory: coarseEventType(ev.title),
      eventTypeKey: normalizeEventTypeKey(ev.title),
    });
  }

  if (eventIds.length > 0) {
    // 4a. Sovereign tags + relationship replay (per event-id rows).
    try {
      const { data: tagRows } = await supabase
        .from("event_priority_memory")
        .select("event_id, signal, meta, occurred_at")
        .eq("user_id", userId)
        .in("event_id", eventIds)
        .in("signal", [
          "tag_importance_high",
          "tag_importance_medium",
          "tag_importance_low",
          "tag_custom",
          "tag_cleared",
          "tag_relationship",
        ])
        .order("occurred_at", { ascending: false });

      const seenImportance = new Set<string>();
      const clearedFor = new Set<string>();
      const stampedRelFor = new Set<string>();
      for (const r of (tagRows ?? []) as any[]) {
        const eid = r.event_id;
        if (!eid) continue;
        if (r.signal === "tag_cleared") { clearedFor.add(eid); continue; }
        if (r.signal === "tag_relationship") {
          if (stampedRelFor.has(eid)) continue;
          const tag = String(r?.meta?.relationshipTag || "").toLowerCase().trim();
          const role = RELATIONSHIP_TAG_TO_ROLE[tag];
          if (!role) continue;
          stampedRelFor.add(eid);
          const ems = attendeesByEventId.get(eid) ?? [];
          for (const em of ems) {
            const existing = signalByEmail.get(em);
            if (existing && existing.source === "user_tag") continue;
            signalByEmail.set(em, { role, source: "memory_user_tag", confidence: 1 });
          }
          continue;
        }
        if (r.signal === "tag_custom") {
          const arr = Array.isArray(r?.meta?.customTags) ? r.meta.customTags : [];
          const list = sovereignTagsByEventId.get(eid) ?? [];
          for (const t of arr) if (t) list.push(String(t));
          sovereignTagsByEventId.set(eid, list);
          continue;
        }
        if (r.signal.startsWith("tag_importance_")) {
          if (seenImportance.has(eid)) continue;
          if (clearedFor.has(eid)) { seenImportance.add(eid); continue; }
          const level = r.signal.slice("tag_importance_".length);
          const list = sovereignTagsByEventId.get(eid) ?? [];
          list.push(level);
          sovereignTagsByEventId.set(eid, list);
          seenImportance.add(eid);
        }
      }
    } catch (_e) { /* optional */ }

    // 4b. Derived memoryDelta from category/type-key history (legacy keys) + title-specific memory.
    try {
      const memoryIndex = await loadPriorityMemoryForUser(supabase, userId, memoryLookbackDays);
      for (const [eid, key] of legacyKeysByEventId.entries()) {
        const ev = events.find(e => e.id === eid);
        const titleKey = {
          eventCategory: TITLE_SPECIFIC_MEMORY_CATEGORY,
          eventTypeKey: normalizeEventTitleMemoryKey(ev?.title),
        };
        
        const res = applyEventPriorityMemory(memoryIndex, key);
        const titleRes = applyEventPriorityMemory(memoryIndex, titleKey);
        
        const combinedDelta = res.delta + titleRes.delta;
        const combinedHardDemote = res.hardDemote || titleRes.hardDemote;
        const combinedHasPriorDayPriority = res.hasPriorDayPriority || titleRes.hasPriorDayPriority;
        const combinedPriorityCount = res.priorityCount + titleRes.priorityCount;
        
        if (combinedDelta !== 0 || combinedHardDemote) {
          memoryDeltaByEventId![eid] = {
            delta: combinedDelta,
            hardDemote: combinedHardDemote || undefined,
            hasPriorDayPriority: combinedHasPriorDayPriority || undefined,
            priorityCount: combinedPriorityCount || undefined,
          };
        }
      }
    } catch (_e) { /* optional */ }
  }

  // ── 5. Domain heuristic backstop ────────────────────────────────────
  for (const em of allEmails) {
    if (signalByEmail.has(em)) continue;
    if (isGenericDomain(em)) continue;
    const sig = inferRoleFromDomain(em, userOwnDomain);
    if (sig.role !== "unknown") signalByEmail.set(em, sig);
  }

  // ── 6. signal_summary ──────────────────────────────────────────────
  let signalSummary: any = null;
  try {
    const { data } = await supabase
      .from("causality_findings")
      .select("signal_summary")
      .eq("user_id", userId)
      .eq("pattern_kind", "cause_effect_v2")
      .order("computed_for_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    signalSummary = (data as any)?.signal_summary ?? null;
  } catch (_e) { /* null tier T0 */ }

  // ── 6.5. jit_preferences (skip/follow-through counts) ───────────────
  const skipCountsByBucket: Record<string, number> = {};
  const followThroughByBucket: Record<string, number> = {};
  try {
    const { data: prefs } = await supabase
      .from("jit_preferences")
      .select("event_type, action")
      .eq("user_id", userId);
    for (const p of (prefs ?? []) as any[]) {
      const bucket = p.event_type;
      if (!bucket) continue;
      if (p.action === "skip" || p.action === "dismissed" || p.action === "skipped" || p.action === "cancelled") {
        skipCountsByBucket[bucket] = (skipCountsByBucket[bucket] || 0) + 1;
      } else if (p.action === "completed" || p.action === "reflected" || p.action === "recurring_improvement") {
        followThroughByBucket[bucket] = (followThroughByBucket[bucket] || 0) + 1;
      }
    }
  } catch (_e) { /* optional */ }

  // ── 7. Compose SelectInputEvent[] ───────────────────────────────────
  const input: SelectInputEvent[] = [];
  for (const ev of events) {
    if (!ev?.id || !ev?.title) continue;
    const ems = attendeesByEventId.get(ev.id) ?? [];
    const roles: AttendeeRoleSignal[] = [];
    for (const em of ems) {
      const s = signalByEmail.get(em);
      if (s) roles.push(s);
    }
    const sovTags = sovereignTagsByEventId.get(ev.id) ?? [];
    input.push({
      id: ev.id,
      title: ev.title,
      start_time: ev.start_time,
      end_time: ev.end_time ?? null,
      createdAt: ev.created_at ?? null,
      organizerEmail: organizerByEventId.get(ev.id) ?? null,
      attendeeDomains: attendeeDomainsByEventId.get(ev.id) ?? [],
      userDomain: userOwnDomain,
      attendeesCount: typeof ev.attendees_count === "number" ? ev.attendees_count : 0,
      attendeeRoles: roles,
      tags: sovTags,
    });
  }

  const ctx: SelectContext = {
    accountAgeDays,
    signalSummary,
    skipCountsByBucket,
    followThroughByBucket,
    goals: opts.goals ?? null,
    nowMs: opts.nowMs ?? Date.now(),
    memoryDeltaByEventId,
  };

  return { input, ctx };
}