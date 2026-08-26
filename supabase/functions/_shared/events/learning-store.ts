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
}

export const EMPTY_LEARNING_CONTEXT: LearningContext = {
  titles: new Map(),
  tokens: new Map(),
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

// ── IO ───────────────────────────────────────────────────────────────
// All DB helpers are best-effort: a failure degrades to the dictionary and
// must never block classification.

// deno-lint-ignore no-explicit-any
type Db = any;

export async function loadLearningContext(
  supabase: Db,
  userId: string,
): Promise<LearningContext> {
  const ctx: LearningContext = { titles: new Map(), tokens: new Map() };
  if (!supabase || !userId) return ctx;
  try {
    const [{ data: conf }, { data: toks }] = await Promise.all([
      supabase
        .from("event_category_confirmations")
        .select("title_norm, event_category, event_subcategory, subtype_id, confidence, source")
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
      if (!r?.title_norm || !r?.event_category) continue;
      ctx.titles.set(String(r.title_norm), {
        category: String(r.event_category).trim() as EventCategoryId,
        subcategory: r.event_subcategory ?? null,
        subtypeId: r.subtype_id ?? null,
        confidence: (r.confidence ?? "medium") as LearnedHit["confidence"],
        source: (r.source ?? "resolver") as LearnedSource,
        via: "confirmed_title",
      });
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
    const incomingIsUserBacked = input.source === "user_override" ||
      input.source === "plan_slot";
    if (existingIsUserBacked && !incomingIsUserBacked) {
      // Don't let a dictionary guess overwrite what the user told us, and do
      // NOT bump observation_count — a resolver re-observing itself is not
      // new evidence. Only recency moves.
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
