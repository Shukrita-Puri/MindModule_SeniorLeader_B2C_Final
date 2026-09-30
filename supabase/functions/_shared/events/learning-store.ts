// OWNERSHIP: engineering. Learning loop for the A–H event taxonomy.
//
// Three shared stores, read by the single resolver so every surface (Brief,
// signal pills, Week-Ahead, JIT v2, Nudges, Insights) benefits from one write:
//
//   1. event_category_confirmations — per user, per normalised title. Written
//      on every confident resolve and on every user override. Read at
//      resolver layer 1 (just under explicit user tags).
//   2. event_learned_tokens        — per user token cues promoted nightly by
//      public.promote_learned_event_tokens() when the same category recurs
//      across ≥3 distinct titles sharing a distinctive token. Read at layer 2.
//   3. calendar_events stamps      — event_category / event_subcategory plus
//      provenance (category_resolved_by / category_confidence).
//
// Everything degrades to the dictionary when the stores are empty.

import type { EventCategoryId } from "./event-categories.ts";
import type {
  ScopedMemoryRecord,
  MemoryScopeType,
  MemoryType,
} from "./spine-contracts.ts";

export type LearnedSource = "user_override" | "plan_slot" | "resolver" | "token_generalisation";

export interface LearnedHit {
  category: EventCategoryId | null;
  subcategory: string | null;
  subtypeId: string | null;
  confidence: "high" | "medium" | "low";
  source: LearnedSource;
  via: "confirmed_title" | "learned_token";
}

export interface LearningContext {
  /** normalised title → confirmed classification */
  titles: Map<string, LearnedHit>;
  /** distinctive token → learned classification */
  tokens: Map<string, LearnedHit>;
  /** Scoped memory records (Spine Contract 4 & 5: event, series, pattern, person, org) */
  scopedMemories?: Map<string, ScopedMemoryRecord>;
}

export const EMPTY_LEARNING_CONTEXT: LearningContext = {
  titles: new Map(),
  tokens: new Map(),
  scopedMemories: new Map(),
};

/** Canonical per-user memory key for a calendar title. */
export function normaliseTitleKey(title: string | null | undefined): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 256);
}

/** Tokens excluded from generalisation — too generic to carry a category. */
export const TOKEN_STOPWORDS = new Set([
  "with", "meeting", "call", "review", "team", "weekly", "monthly", "session",
  "sync", "update", "catch", "chat", "from", "into", "your", "this", "that",
  "time", "block", "discussion", "check", "follow", "plan", "planning",
]);

/** Distinctive tokens of a title (≥4 chars, not numeric, not a stopword). */
export function extractDistinctiveTokens(title: string | null | undefined): string[] {
  const norm = normaliseTitleKey(title);
  if (!norm) return [];
  const out: string[] = [];
  for (const tok of norm.split(" ")) {
    if (tok.length < 4) continue;
    if (/^[0-9]+$/.test(tok)) continue;
    if (TOKEN_STOPWORDS.has(tok)) continue;
    if (!out.includes(tok)) out.push(tok);
  }
  return out;
}

/**
 * Pure lookup used by the resolver. Confirmed title wins over learned token.
 * Returns null when the stores hold nothing for this title (→ dictionary).
 */
export function lookupLearned(
  ctx: LearningContext | null | undefined,
  title: string | null | undefined,
): LearnedHit | null {
  if (!ctx) return null;
  const key = normaliseTitleKey(title);
  if (!key) return null;
  const confirmed = ctx.titles.get(key);
  if (confirmed && confirmed.category) return confirmed;
  if (ctx.tokens.size === 0) return null;
  for (const tok of extractDistinctiveTokens(title)) {
    const hit = ctx.tokens.get(tok);
    if (hit && hit.category) return hit;
  }
  return null;
}

// ── Contract 4 & 5: Scoped Memory Helpers & Pure Lookup ────────────────

export function formatScopeKey(
  scopeType: MemoryScopeType,
  key: string,
  memoryType: MemoryType = "event_category",
  value = "",
): string {
  const cleanKey = (key ?? "").trim();
  let base = cleanKey;
  switch (scopeType) {
    case "event":
      base = `event:${cleanKey}`;
      break;
    case "series":
      base = `series:${cleanKey}`;
      break;
    case "title_pattern":
      base = `pattern:${normaliseTitleKey(cleanKey)}`;
      break;
    case "person":
      base = `person:${cleanKey.toLowerCase()}`;
      break;
    case "organisation":
      base = `org:${cleanKey.toLowerCase()}`;
      break;
    default:
      base = cleanKey;
      break;
  }
  if (memoryType === "negative_category" && value) {
    return `${base}:not:${value.toLowerCase()}`;
  }
  return base;
}

export function parseScopedMemoryFromRow(
  r: any,
  fallbackUserId = "",
): ScopedMemoryRecord | null {
  if (!r) return null;
  const rawResolved = r.resolved_by;
  if (rawResolved && typeof rawResolved === "string" && rawResolved.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(rawResolved);
      if (parsed.scopeType && parsed.scopeKey) {
        return {
          id: r.id ? String(r.id) : undefined,
          userId: r.user_id ? String(r.user_id) : fallbackUserId,
          scopeType: parsed.scopeType as MemoryScopeType,
          scopeKey: String(parsed.scopeKey),
          memoryType: (parsed.memoryType ?? "event_category") as MemoryType,
          value: parsed.value ? String(parsed.value) : (r.event_category ? String(r.event_category).trim() : ""),
          subtypeId: parsed.subtypeId ?? r.subtype_id ?? null,
          source: (parsed.source ?? (r.source === "user_override" ? "user" : "inferred")),
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : (r.confidence === "high" ? 1.0 : 0.7),
          confirmedAt: parsed.confirmedAt || r.updated_at || r.created_at || new Date().toISOString(),
          expiresAt: parsed.expiresAt ?? null,
          revokedAt: parsed.revokedAt ?? null,
          version: parsed.version || "2026.09.A_J",
        };
      }
    } catch (_e) {
      // Degrade to legacy row parsing.
    }
  }

  const titleNorm = String(r.title_norm ?? "").trim();
  if (!titleNorm) return null;

  if (titleNorm.includes(":not:")) {
    const [baseScope, notVal] = titleNorm.split(":not:");
    let scopeType: MemoryScopeType = "title_pattern";
    let scopeKey = baseScope;
    if (baseScope.startsWith("event:")) {
      scopeType = "event";
      scopeKey = baseScope.slice("event:".length);
    } else if (baseScope.startsWith("series:")) {
      scopeType = "series";
      scopeKey = baseScope.slice("series:".length);
    } else if (baseScope.startsWith("pattern:")) {
      scopeType = "title_pattern";
      scopeKey = baseScope.slice("pattern:".length);
    } else if (baseScope.startsWith("person:")) {
      scopeType = "person";
      scopeKey = baseScope.slice("person:".length);
    } else if (baseScope.startsWith("org:")) {
      scopeType = "organisation";
      scopeKey = baseScope.slice("org:".length);
    }
    return {
      id: r.id ? String(r.id) : undefined,
      userId: r.user_id ? String(r.user_id) : fallbackUserId,
      scopeType,
      scopeKey,
      memoryType: "negative_category",
      value: notVal.toUpperCase(),
      source: r.source === "user_override" ? "user" : "inferred",
      confidence: 1.0,
      confirmedAt: r.updated_at || r.created_at || new Date().toISOString(),
      expiresAt: null,
      revokedAt: null,
      version: "2026.09.A_J",
    };
  }

  let scopeType: MemoryScopeType = "title_pattern";
  let scopeKey = titleNorm;

  if (titleNorm.startsWith("event:")) {
    scopeType = "event";
    scopeKey = titleNorm.slice("event:".length);
  } else if (titleNorm.startsWith("series:")) {
    scopeType = "series";
    scopeKey = titleNorm.slice("series:".length);
  } else if (titleNorm.startsWith("pattern:")) {
    scopeType = "title_pattern";
    scopeKey = titleNorm.slice("pattern:".length);
  } else if (titleNorm.startsWith("person:")) {
    scopeType = "person";
    scopeKey = titleNorm.slice("person:".length);
  } else if (titleNorm.startsWith("org:")) {
    scopeType = "organisation";
    scopeKey = titleNorm.slice("org:".length);
  }

  return {
    id: r.id ? String(r.id) : undefined,
    userId: r.user_id ? String(r.user_id) : fallbackUserId,
    scopeType,
    scopeKey,
    memoryType: "event_category",
    value: r.event_category ? String(r.event_category).trim() : "",
    source: r.source === "user_override" ? "user" : "inferred",
    confidence: r.confidence === "high" ? 1.0 : 0.7,
    confirmedAt: r.updated_at || r.created_at || new Date().toISOString(),
    expiresAt: null,
    revokedAt: null,
    version: "legacy",
  };
}

export function isValidMemory(rec: ScopedMemoryRecord): boolean {
  if (rec.revokedAt) return false;
  if (rec.expiresAt) {
    const exp = new Date(rec.expiresAt).getTime();
    if (!Number.isNaN(exp) && exp < Date.now()) return false;
  }
  return true;
}

export interface ScopedMemoryQuery {
  eventId?: string | null;
  seriesId?: string | null;
  title?: string | null;
  emails?: (string | null | undefined)[];
  domains?: (string | null | undefined)[];
}

/**
 * Pure lookup across scopes:
 * THIS_EVENT > THIS_SERIES > TITLE_PATTERN > PERSON > ORGANISATION
 */
export function lookupScopedMemoryFromContext(
  ctx: LearningContext | null | undefined,
  query: ScopedMemoryQuery,
): ScopedMemoryRecord | null {
  if (!ctx) return null;
  const memories = ctx.scopedMemories;

  // 1. THIS_EVENT
  if (query.eventId && memories) {
    const match = memories.get(`event:${query.eventId.trim()}`);
    if (match && isValidMemory(match)) return match;
  }

  // 2. THIS_SERIES
  if (query.seriesId && memories) {
    const match = memories.get(`series:${query.seriesId.trim()}`);
    if (match && isValidMemory(match)) return match;
  }

  // 3. TITLE_PATTERN
  if (query.title) {
    const norm = normaliseTitleKey(query.title);
    if (norm) {
      if (memories) {
        const patMatch = memories.get(`pattern:${norm}`);
        if (patMatch && isValidMemory(patMatch)) return patMatch;
        const normMatch = memories.get(norm);
        if (normMatch && isValidMemory(normMatch)) return normMatch;
      }
      const titleHit = ctx.titles.get(norm);
      if (titleHit && titleHit.category) {
        return {
          userId: "",
          scopeType: "title_pattern",
          scopeKey: norm,
          memoryType: "event_category",
          value: titleHit.category,
          source: titleHit.source === "user_override" ? "user" : "inferred",
          confidence: titleHit.confidence === "high" ? 1.0 : 0.7,
          confirmedAt: new Date().toISOString(),
          version: "legacy",
        };
      }
    }
  }

  // 4. PERSON
  if (query.emails && memories) {
    for (const email of query.emails) {
      if (!email) continue;
      const match = memories.get(`person:${email.toLowerCase().trim()}`);
      if (match && isValidMemory(match)) return match;
    }
  }

  // 5. ORGANISATION
  if (query.domains && memories) {
    for (const domain of query.domains) {
      if (!domain) continue;
      const match = memories.get(`org:${domain.toLowerCase().trim()}`);
      if (match && isValidMemory(match)) return match;
    }
  }

  return null;
}

/**
 * Pure lookup across scopes for negative memory ("not this" categories).
 * Returns a Set of category IDs that have been explicitly excluded for this query.
 */
export function lookupScopedNegativeCategoriesFromContext(
  ctx: LearningContext | null | undefined,
  query: ScopedMemoryQuery,
): Set<EventCategoryId> {
  const negatives = new Set<EventCategoryId>();
  if (!ctx || !ctx.scopedMemories) return negatives;

  const candidatePrefixes: string[] = [];
  if (query.eventId) candidatePrefixes.push(`event:${query.eventId.trim()}`);
  if (query.seriesId) candidatePrefixes.push(`series:${query.seriesId.trim()}`);
  if (query.title) {
    const norm = normaliseTitleKey(query.title);
    if (norm) {
      candidatePrefixes.push(`pattern:${norm}`);
      candidatePrefixes.push(norm);
    }
  }
  if (query.emails) {
    for (const email of query.emails) {
      if (email) candidatePrefixes.push(`person:${email.toLowerCase().trim()}`);
    }
  }
  if (query.domains) {
    for (const domain of query.domains) {
      if (domain) candidatePrefixes.push(`org:${domain.toLowerCase().trim()}`);
    }
  }

  for (const [key, rec] of ctx.scopedMemories.entries()) {
    if (!isValidMemory(rec)) continue;
    if (rec.memoryType !== "negative_category") continue;
    for (const prefix of candidatePrefixes) {
      if (key === prefix || key.startsWith(`${prefix}:not:`) || rec.scopeKey === prefix.replace(/^[^:]+:/, "")) {
        if (rec.value && rec.value.length === 1) {
          negatives.add(rec.value.toUpperCase() as EventCategoryId);
        }
      }
    }
  }
  return negatives;
}

// ── IO ───────────────────────────────────────────────────────────────
// All DB helpers are best-effort: a failure degrades to the dictionary and
// must never block classification.

// deno-lint-ignore no-explicit-any
type Db = any;

export async function loadLearningContext(
  supabase: Db,
  userId: string,
): Promise<LearningContext> {
  const ctx: LearningContext = {
    titles: new Map(),
    tokens: new Map(),
    scopedMemories: new Map(),
  };
  if (!supabase || !userId) return ctx;
  try {
    const [{ data: conf }, { data: toks }] = await Promise.all([
      supabase
        .from("event_category_confirmations")
        .select("id, user_id, title_norm, event_category, event_subcategory, subtype_id, confidence, source, resolved_by, created_at, updated_at")
        .eq("user_id", userId)
        .limit(2000),
      supabase
        .from("event_learned_tokens")
        .select("token, event_category, event_subcategory, subtype_id, confidence")
        .eq("user_id", userId)
        .is("retired_at", null)
        .limit(500),
    ]);
    for (const r of conf ?? []) {
      if (!r?.title_norm) continue;
      const titleNormStr = String(r.title_norm);
      const isScoped = titleNormStr.startsWith("event:") ||
        titleNormStr.startsWith("series:") ||
        titleNormStr.startsWith("pattern:") ||
        titleNormStr.startsWith("person:") ||
        titleNormStr.startsWith("org:");

      if (r?.event_category && !isScoped) {
        ctx.titles.set(titleNormStr, {
          category: String(r.event_category).trim() as EventCategoryId,
          subcategory: r.event_subcategory ?? null,
          subtypeId: r.subtype_id ?? null,
          confidence: (r.confidence ?? "medium") as LearnedHit["confidence"],
          source: (r.source ?? "resolver") as LearnedSource,
          via: "confirmed_title",
        });
      }

      const scoped = parseScopedMemoryFromRow(r, userId);
      if (scoped) {
        ctx.scopedMemories!.set(
          formatScopeKey(scoped.scopeType, scoped.scopeKey, scoped.memoryType, scoped.value),
          scoped,
        );
        if (scoped.scopeType === "title_pattern") {
          ctx.scopedMemories!.set(normaliseTitleKey(scoped.scopeKey), scoped);
        }
      }
    }
    for (const r of toks ?? []) {
      if (!r?.token || !r?.event_category) continue;
      ctx.tokens.set(String(r.token), {
        category: String(r.event_category).trim() as EventCategoryId,
        subcategory: r.event_subcategory ?? null,
        subtypeId: r.subtype_id ?? null,
        confidence: (r.confidence ?? "medium") as LearnedHit["confidence"],
        source: "token_generalisation",
        via: "learned_token",
      });
    }
  } catch (_err) {
    // Degrade to dictionary.
  }
  return ctx;
}

export interface ConfirmationInput {
  userId: string;
  title: string | null | undefined;
  category: string | null;
  subcategory?: string | null;
  subtypeId?: string | null;
  source: LearnedSource;
  resolvedBy?: string | null;
  confidence?: "high" | "medium" | "low";
}

/**
 * Confidence ceiling per source. The loop must not harden its own guesses:
 * only an explicit user action (`user_override`) or an event the user pulled
 * into a plan slot (`plan_slot`) may reach `high`. Everything the resolver
 * derives on its own caps at `medium`.
 */
export function cappedConfidence(
  source: LearnedSource,
  requested?: "high" | "medium" | "low" | null,
): "high" | "medium" | "low" {
  const isUserBacked = source === "user_override" || source === "plan_slot";
  const want = requested ?? (isUserBacked ? "high" : "medium");
  if (!isUserBacked && want === "high") return "medium";
  return want;
}

/**
 * Upsert a confirmed classification for a title. User overrides always win:
 * a `user_override` row replaces a resolver-derived one, never the reverse.
 */
export async function recordConfirmation(
  supabase: Db,
  input: ConfirmationInput,
): Promise<void> {
  // Spec §10 & §14 Step 21: Stop writing engine results and plan-slot pulls as confirmations.
  // The system never teaches itself. Only explicit user actions record confirmed memory.
  if (input.source === "resolver" || input.source === "plan_slot") {
    return;
  }

  const titleNorm = normaliseTitleKey(input.title);
  const category = input.category ? String(input.category).trim().slice(0, 1) : null;
  if (!supabase || !input.userId || !titleNorm || !category) return;
  const confidence = cappedConfidence(input.source, input.confidence ?? null);
  try {
    const { data: existing } = await supabase
      .from("event_category_confirmations")
      .select("id, source, observation_count, event_category")
      .eq("user_id", input.userId)
      .eq("title_norm", titleNorm)
      .maybeSingle();

    if (!existing) {
      await supabase.from("event_category_confirmations").insert({
        user_id: input.userId,
        title_norm: titleNorm,
        event_category: category,
        event_subcategory: input.subcategory ?? null,
        subtype_id: input.subtypeId ?? null,
        source: input.source,
        resolved_by: input.resolvedBy ?? null,
        confidence,
      });
      return;
    }

    const existingIsUserBacked = existing.source === "user_override" ||
      existing.source === "plan_slot";
    const incomingIsUserBacked = input.source === "user_override";
    if (existingIsUserBacked && !incomingIsUserBacked) {
      await supabase
        .from("event_category_confirmations")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", existing.id);
      return;
    }

    const selfObservation = !incomingIsUserBacked &&
      existing.event_category === category;

    await supabase
      .from("event_category_confirmations")
      .update({
        event_category: category,
        event_subcategory: input.subcategory ?? null,
        subtype_id: input.subtypeId ?? null,
        source: input.source,
        resolved_by: input.resolvedBy ?? null,
        confidence,
        // Self-observation never accrues evidence weight.
        observation_count: selfObservation
          ? (existing.observation_count ?? 1)
          : (existing.observation_count ?? 1) + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } catch (_err) {
    // Best-effort.
  }
}

/**
 * Record a scoped memory correction (THIS_EVENT, THIS_SERIES, TITLE_PATTERN, PERSON, ORGANISATION).
 * Stored in `event_category_confirmations` behind the single memory service abstraction.
 */
export async function recordScopedCorrection(
  supabase: Db,
  record: ScopedMemoryRecord,
): Promise<void> {
  if (!supabase || !record.userId || !record.scopeKey) return;

  // Safeguards (Spec §10 & §14 Step 21):
  // 1. Only user actions or reviewed rules create decisive memory.
  // Machine inferences and plan pulls never write confirmations.
  if (record.source !== "user" && record.source !== "reviewed_rule") {
    return;
  }
  // 2. Extra care for J: an inferred J never becomes confirmed memory.
  if (record.value === "J" && record.source !== "user") {
    return;
  }

  const titleNormKey = formatScopeKey(
    record.scopeType,
    record.scopeKey,
    record.memoryType,
    record.value,
  );
  const isCategory = record.memoryType === "event_category";
  const category = isCategory && record.value ? record.value.slice(0, 1) : null;
  const mappedSource: LearnedSource = "user_override";
  const confidence = "high";

  const payload = {
    v: 1,
    scopeType: record.scopeType,
    scopeKey: record.scopeKey,
    memoryType: record.memoryType,
    value: record.value,
    subtypeId: record.subtypeId ?? null,
    source: record.source,
    confidence: record.confidence,
    confirmedAt: record.confirmedAt || new Date().toISOString(),
    expiresAt: record.expiresAt ?? null,
    revokedAt: record.revokedAt ?? null,
    version: record.version || "2026.09.A_J",
  };

  try {
    const { data: existing } = await supabase
      .from("event_category_confirmations")
      .select("id, source, observation_count, resolved_by")
      .eq("user_id", record.userId)
      .eq("title_norm", titleNormKey)
      .maybeSingle();

    if (!existing) {
      await supabase.from("event_category_confirmations").insert({
        user_id: record.userId,
        title_norm: titleNormKey,
        event_category: category,
        event_subcategory: null,
        subtype_id: record.subtypeId ?? null,
        source: mappedSource,
        resolved_by: JSON.stringify(payload),
        confidence,
        observation_count: 1,
      });
      return;
    }

    await supabase
      .from("event_category_confirmations")
      .update({
        event_category: category,
        subtype_id: record.subtypeId ?? null,
        source: mappedSource,
        resolved_by: JSON.stringify(payload),
        confidence,
        observation_count: (existing.observation_count ?? 1) + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } catch (_err) {
    // Best-effort.
  }
}

export interface UserCorrectionInput {
  userId: string;
  eventId?: string | null;
  seriesId?: string | null;
  title?: string | null;
  emails?: (string | null | undefined)[];
  domains?: (string | null | undefined)[];
  scope?: "THIS_EVENT" | "THIS_SERIES" | "TITLE_PATTERN" | "PERSON" | "ORGANISATION" | MemoryScopeType;
  category: EventCategoryId;
  subtypeId?: string | null;
  previousCategory?: string | null;
  negative?: boolean; // user explicitly marks "not this"
  source?: "user" | "daily_question";
}

/**
 * High-level user correction entry point (Spec §10 & §14 Step 21/22).
 * Writes scoped confirmed memory, records negative memory ("not this") for previous category,
 * and stamps the live calendar_events row directly.
 */
export async function recordUserCorrection(
  supabase: Db,
  input: UserCorrectionInput,
): Promise<{ success: boolean; scopeType: MemoryScopeType; scopeKey: string }> {
  if (!supabase || !input.userId || !input.category) {
    return { success: false, scopeType: "event", scopeKey: "" };
  }

  // Determine scope
  let scopeType: MemoryScopeType = "event";
  let scopeKey = input.eventId ?? "";

  const s = String(input.scope || "").toUpperCase();
  if (s === "THIS_SERIES" || s === "SERIES") {
    scopeType = "series";
    scopeKey = input.seriesId ?? input.eventId ?? "";
  } else if (s === "TITLE_PATTERN" || s === "PATTERN" || s === "TITLE_PATTERN") {
    scopeType = "title_pattern";
    scopeKey = normaliseTitleKey(input.title);
  } else if (s === "PERSON") {
    scopeType = "person";
    scopeKey = (input.emails?.find(Boolean) ?? "").toLowerCase();
  } else if (s === "ORGANISATION" || s === "ORG") {
    scopeType = "organisation";
    scopeKey = (input.domains?.find(Boolean) ?? "").toLowerCase();
  } else {
    scopeType = "event";
    scopeKey = input.eventId ?? normaliseTitleKey(input.title);
  }

  if (!scopeKey) {
    scopeType = "title_pattern";
    scopeKey = normaliseTitleKey(input.title);
  }

  // 1. Record the positive confirmation (or direct negative if negative is true)
  if (input.negative) {
    await recordScopedCorrection(supabase, {
      userId: input.userId,
      scopeType,
      scopeKey,
      memoryType: "negative_category",
      value: input.category,
      source: "user",
      confidence: 1.0,
      confirmedAt: new Date().toISOString(),
      version: "2026.09.A_J",
    });
  } else {
    await recordScopedCorrection(supabase, {
      userId: input.userId,
      scopeType,
      scopeKey,
      memoryType: "event_category",
      value: input.category,
      subtypeId: input.subtypeId ?? null,
      source: "user",
      confidence: 1.0,
      confirmedAt: new Date().toISOString(),
      version: "2026.09.A_J",
    });

    // 2. Negative memory: "not this" for the old answer at the same scope (Spec §10)
    if (input.previousCategory && input.previousCategory !== input.category) {
      await recordScopedCorrection(supabase, {
        userId: input.userId,
        scopeType,
        scopeKey,
        memoryType: "negative_category",
        value: input.previousCategory.slice(0, 1),
        source: "user",
        confidence: 1.0,
        confirmedAt: new Date().toISOString(),
        version: "2026.09.A_J",
      });
    }

    // 3. Stamp calendar_events row directly if eventId is available
    if (input.eventId) {
      await stampCalendarEventCategory(supabase, {
        userId: input.userId,
        eventId: input.eventId,
        title: input.title ?? null,
        category: input.category,
        subcategory: input.subtypeId ?? null,
        resolvedBy: input.source === "daily_question" ? "daily_question_answer" : "user_override",
        confidence: "high",
      });
    }
  }

  return { success: true, scopeType, scopeKey };
}

/**
 * Revoke/undo a previously recorded scoped correction (Spec §10 Safeguard 6: Undo).
 */
export async function revokeScopedCorrection(
  supabase: Db,
  params: {
    userId: string;
    scopeType: MemoryScopeType;
    scopeKey: string;
    memoryType?: MemoryType;
    value?: string;
  },
): Promise<boolean> {
  if (!supabase || !params.userId || !params.scopeKey) return false;
  const titleNormKey = formatScopeKey(
    params.scopeType,
    params.scopeKey,
    params.memoryType ?? "event_category",
    params.value ?? "",
  );
  try {
    const { data: existing } = await supabase
      .from("event_category_confirmations")
      .select("id, resolved_by")
      .eq("user_id", params.userId)
      .eq("title_norm", titleNormKey)
      .maybeSingle();

    if (!existing) return false;

    let payload: Record<string, unknown> = {};
    if (existing.resolved_by && typeof existing.resolved_by === "string") {
      try {
        payload = JSON.parse(existing.resolved_by);
      } catch {
        payload = {};
      }
    }
    payload.revokedAt = new Date().toISOString();

    const { error } = await supabase
      .from("event_category_confirmations")
      .update({
        resolved_by: JSON.stringify(payload),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Look up scoped memory with database fallback when not in ambient memory.
 * Precedence: THIS_EVENT > THIS_SERIES > TITLE_PATTERN > PERSON > ORGANISATION
 */
export async function lookupScopedMemory(
  supabase: Db,
  userId: string,
  query: ScopedMemoryQuery,
): Promise<ScopedMemoryRecord | null> {
  const ambient = ambientLearningContext();
  if (ambient) {
    const fromCtx = lookupScopedMemoryFromContext(ambient, query);
    if (fromCtx) return fromCtx;
  }

  if (!supabase || !userId) return null;

  const candidateKeys: { key: string; precedence: number }[] = [];
  if (query.eventId) candidateKeys.push({ key: `event:${query.eventId.trim()}`, precedence: 1 });
  if (query.seriesId) candidateKeys.push({ key: `series:${query.seriesId.trim()}`, precedence: 2 });
  if (query.title) {
    const norm = normaliseTitleKey(query.title);
    if (norm) {
      candidateKeys.push({ key: `pattern:${norm}`, precedence: 3 });
      candidateKeys.push({ key: norm, precedence: 3 });
    }
  }
  if (query.emails) {
    for (const email of query.emails) {
      if (email) candidateKeys.push({ key: `person:${email.toLowerCase().trim()}`, precedence: 4 });
    }
  }
  if (query.domains) {
    for (const domain of query.domains) {
      if (domain) candidateKeys.push({ key: `org:${domain.toLowerCase().trim()}`, precedence: 5 });
    }
  }

  if (candidateKeys.length === 0) return null;

  try {
    const keyStrings = candidateKeys.map((c) => c.key);
    const { data } = await supabase
      .from("event_category_confirmations")
      .select("id, user_id, title_norm, event_category, event_subcategory, subtype_id, confidence, source, resolved_by, created_at, updated_at")
      .eq("user_id", userId)
      .in("title_norm", keyStrings);

    if (!data || data.length === 0) return null;

    const scoredRows = data
      .map((r: any) => {
        const rec = parseScopedMemoryFromRow(r, userId);
        const cand = candidateKeys.find((c) => c.key === r.title_norm);
        return {
          rec,
          precedence: cand ? cand.precedence : 99,
        };
      })
      .filter((x: any) => x.rec && isValidMemory(x.rec));

    scoredRows.sort((a: any, b: any) => a.precedence - b.precedence);
    return scoredRows[0]?.rec ?? null;
  } catch (_err) {
    return null;
  }
}

export interface StampInput {
  userId: string;
  /** Row id, merged/synthetic id, or `canonical:` merge key. */
  eventId?: string | null;
  /** Real `calendar_events.id` values behind a merged event (preferred). */
  eventIds?: (string | null | undefined)[] | null;
  /** Used to resolve real row ids when only a synthetic id is available. */
  title?: string | null;
  startTime?: string | null;
  category: string | null;
  subcategory?: string | null;
  resolvedBy?: string | null;
  confidence?: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRealRowId(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id.trim());
}

/**
 * Resolve the real `calendar_events.id` rows a stamp should touch.
 *
 * Merged/deduped events carry a synthetic `canonical:<identityKey>` id, which
 * matches no row — that was why stamping never landed. We prefer the explicit
 * `rawEventIds` carried by the merge, then any UUID-shaped id, and finally
 * fall back to a title + start-time lookup so a single-provider event still
 * resolves.
 */
export async function resolveStampTargets(
  supabase: Db,
  input: StampInput,
): Promise<string[]> {
  const direct = [
    ...(input.eventIds ?? []),
    input.eventId,
  ].filter(isRealRowId).map((id) => id.trim());
  if (direct.length > 0) return Array.from(new Set(direct));

  const title = (input.title ?? "").trim();
  const start = input.startTime ? new Date(input.startTime) : null;
  if (!title || !start || Number.isNaN(start.getTime())) return [];
  try {
    // ±10 minutes covers provider rounding between mirrored calendars.
    const lo = new Date(start.getTime() - 10 * 60 * 1000).toISOString();
    const hi = new Date(start.getTime() + 10 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("calendar_events")
      .select("id, title")
      .eq("user_id", input.userId)
      .gte("start_time", lo)
      .lte("start_time", hi)
      .limit(20);
    const wanted = normaliseTitleKey(title);
    return (data ?? [])
      .filter((r: any) => normaliseTitleKey(r?.title) === wanted)
      .map((r: any) => String(r.id));
  } catch (_err) {
    return [];
  }
}

/** Stamp the resolved category back onto calendar_events (idempotent). */
export async function stampCalendarEventCategory(
  supabase: Db,
  input: StampInput,
): Promise<number> {
  const category = input.category ? String(input.category).trim().slice(0, 1) : null;
  if (!supabase || !input.userId || !category) return 0;
  try {
    const ids = await resolveStampTargets(supabase, input);
    if (ids.length === 0) return 0;
    const { error } = await supabase
      .from("calendar_events")
      .update({
        event_category: category,
        event_subcategory: input.subcategory ?? null,
        category_resolved_by: input.resolvedBy ?? null,
        category_confidence: input.confidence ?? null,
        category_resolved_at: new Date().toISOString(),
      })
      .in("id", ids)
      .eq("user_id", input.userId);
    return error ? 0 : ids.length;
  } catch (_err) {
    // Best-effort.
    return 0;
  }
}

// ── Ambient (request-scoped) learning context ────────────────────────
// Surfaces that resolve events deep inside pure helpers (the Brief, the
// signal engine, Nudges, Insights) cannot thread `learned` through every
// call site. `runWithLearningContext` binds it to the current async flow via
// AsyncLocalStorage, so `enrichEvent()` picks it up automatically and no
// context ever bleeds between concurrent requests.

import { AsyncLocalStorage } from "node:async_hooks";

const learningStorage = new AsyncLocalStorage<LearningContext>();

export function ambientLearningContext(): LearningContext | null {
  return learningStorage.getStore() ?? null;
}

export function runWithLearningContext<T>(
  ctx: LearningContext | null | undefined,
  fn: () => T,
): T {
  if (!ctx) return fn();
  return learningStorage.run(ctx, fn);
}

/**
 * Load this user's learning context and run `fn` inside it. Always runs `fn`,
 * even when loading fails — classification then degrades to the dictionary.
 */
export async function withUserLearningContext<T>(
  supabase: Db,
  userId: string | null | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  let ctx: LearningContext | null = null;
  try {
    if (supabase && userId) ctx = await loadLearningContext(supabase, userId);
  } catch (_err) {
    ctx = null;
  }
  return runWithLearningContext(ctx, fn);
}

/**
 * One-line primer for surfaces whose handler body is too large to wrap:
 * binds this user's learning context to the current async flow (and every
 * continuation of it) so `enrichEvent()` reads it automatically.
 * Call once, immediately after the user id is known.
 */
export async function primeLearningContext(
  supabase: Db,
  userId: string | null | undefined,
): Promise<void> {
  try {
    if (!supabase || !userId) return;
    const ctx = await loadLearningContext(supabase, userId);
    // Always set (even when empty) so a previously primed user's context can
    // never linger in a sequential multi-user loop.
    learningStorage.enterWith(ctx);
  } catch (_err) {
    // Degrade to dictionary.
  }
}
