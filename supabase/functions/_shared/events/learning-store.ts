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
        confidence: input.confidence ?? (input.source === "resolver" ? "medium" : "high"),
      });
      return;
    }

    const existingIsOverride = existing.source === "user_override";
    const incomingIsOverride = input.source === "user_override" || input.source === "plan_slot";
    if (existingIsOverride && !incomingIsOverride) {
      // Don't let a dictionary guess overwrite what the user told us; just
      // bump recency.
      await supabase
        .from("event_category_confirmations")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", existing.id);
      return;
    }

    await supabase
      .from("event_category_confirmations")
      .update({
        event_category: category,
        event_subcategory: input.subcategory ?? null,
        subtype_id: input.subtypeId ?? null,
        source: input.source,
        resolved_by: input.resolvedBy ?? null,
        confidence: input.confidence ?? (incomingIsOverride ? "high" : "medium"),
        observation_count: (existing.observation_count ?? 1) + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } catch (_err) {
    // Best-effort.
  }
}

export interface StampInput {
  userId: string;
  eventId: string;
  category: string | null;
  subcategory?: string | null;
  resolvedBy?: string | null;
  confidence?: string | null;
}

/** Stamp the resolved category back onto calendar_events (idempotent). */
export async function stampCalendarEventCategory(
  supabase: Db,
  input: StampInput,
): Promise<void> {
  const category = input.category ? String(input.category).trim().slice(0, 1) : null;
  if (!supabase || !input.userId || !input.eventId || !category) return;
  try {
    await supabase
      .from("calendar_events")
      .update({
        event_category: category,
        event_subcategory: input.subcategory ?? null,
        category_resolved_by: input.resolvedBy ?? null,
        category_confidence: input.confidence ?? null,
        category_resolved_at: new Date().toISOString(),
      })
      .eq("id", input.eventId)
      .eq("user_id", input.userId);
  } catch (_err) {
    // Best-effort.
  }
}