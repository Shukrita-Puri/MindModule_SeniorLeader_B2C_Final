

## Brief Canonicalization + Unified Feedback Pattern

Two coordinated changes, both prompt/UI-only on top of the snapshot architecture you specified.

### Part A — Server-side brief canonicalization (your plan, adopted)

I will implement Steps 1–8 exactly as specified. Key points carried over verbatim:

- **`brief_snapshots` table** keyed by `(user_id, local_date, time_window, input_signature, prompt_version)` with RLS deny-by-default, user-read-own only, service-role writes.
- **`BRIEF_PROMPT_VERSION = 'v6.2-stable-brief-cache'`** constant — bumped whenever the prompt contract changes, which intentionally invalidates the cache.
- **`computeInputSignature()`** SHA-256 of canonicalized material inputs only. `nextHighStakesMinutesUntil` rounded to nearest 5 min to prevent per-minute regeneration. Coach signals included as `null` while suppression is active.
- **Read-snapshot-first** in `compute-outer-readiness/index.ts` after inputs are fetched but before any LLM call. Cache hit returns immediately; LLM is skipped.
- **Persist after generation** as fire-and-forget `upsert` with `onConflict` on the canonical key. Never blocks the response. Stores both LLM and deterministic outputs.
- **`payload_json`** stored server-side for history/debug, never logged, never returned by any endpoint.
- **History endpoint** returns last 30 briefs (id, date, window, phrase/body/leanOn/watchFor, score, tier, user_rating, created_at) — never `payload_json`, never `input_signature`, never `prompt_version`.
- **Observability**: every request logs `snapshotHit`, `briefSource`, `generationPath`, `snapshotReason`, and the first 8 chars of the signature.
- **Daily_themes untouched**; existing response shape preserved (only additive `snapshotHit` and signature prefix added).

### Part B — Refinements I'm adding to your plan

1. **`user_rating` becomes a 3-state enum, not a boolean.** Your spec uses `boolean` (true/false/null). The Claude-style UX you described has thumbs-up / neutral (=) / thumbs-down — three states, not two. Change column to `text CHECK (user_rating IN ('up','neutral','down'))` nullable. This is a one-line schema change that prevents a future migration when the UI ships.

2. **Add `feedback_text text` column** to `brief_snapshots`. The Claude pattern pairs the rating with an open-ended form ("What was satisfying about this response?"). Storing it on the same row keeps rating + comment atomic per brief.

3. **Rating endpoint accepts both fields.** `POST /brief-rating` body becomes `{ briefId, rating: 'up'|'neutral'|'down', feedback?: string }`. RLS enforces `user_id = auth.uid()`.

4. **Snapshot-cache feature flag default = ON in the edge function**, OFF only in the client refetch toggle. Server-side caching should ship behind no flag — it's a correctness fix. The client-side `refetchOnWindowFocus: false` toggle stays gated by `VITE_ENABLE_BRIEF_SNAPSHOT_CACHE` per your Step 6.

### Part C — Unified in-app feedback pattern (separate concern, same release)

Replace every star-based feedback surface in the app with the Claude-style pattern:

- **Three-icon row**: 👍 (up) · ⚌ (neutral) · 👎 (down)
- **Optional open-ended textarea** that appears after a rating is selected: *"What was useful?"* (for up/neutral) or *"What was off?"* (for down)
- **Single submit + cancel** at the bottom

**Affected components** (all swap from stars to thumbs):
- `src/components/home/PlanFeedbackModal.tsx` — currently 1–5 stars; replace with three-icon + textarea
- Any other feedback surfaces using the same star pattern (I'll grep `PlanFeedbackModal` and `rating` to confirm scope before edit)
- The new brief-rating control on the history panel

**Shared component**: extract `<FeedbackCapture rating onChange feedback onChange onSubmit onCancel />` so the same UI is reused everywhere. Star UI is removed in this pass — no parallel patterns.

**Why this matters**: stars require the leader to translate a felt response into a 5-point scale (cognitive load with no upside). Thumbs + open text is one binary judgement plus optional voice — faster, less ambiguous, and aligns with how leaders give feedback in real systems (Claude, Gmail, Notion AI all use this pattern).

### Files touched

- New migration: `brief_snapshots` table + RLS (with 3-state `user_rating` and `feedback_text` columns)
- `supabase/functions/compute-outer-readiness/index.ts` — signature, read-first, persist, observability
- New edge function or extension: `brief-history` (GET) and `brief-rating` (POST)
- `src/hooks/useOuterReadiness.ts` — flag-gated `refetchOnWindowFocus: false`
- `src/components/feedback/FeedbackCapture.tsx` — new shared component (thumbs + textarea)
- `src/components/home/PlanFeedbackModal.tsx` — swap stars → `FeedbackCapture`
- Any other star-based feedback callers swapped to `FeedbackCapture`

### Verification (your checklist + feedback additions)

All your STEP 8 verify items, plus:
- Three-state rating writes correctly (`up`/`neutral`/`down`)
- Optional `feedback_text` persists when provided, omitted otherwise
- No star UI remains anywhere in the app
- `FeedbackCapture` is the single shared pattern across PlanFeedback, brief rating, and any future feedback

### What still must not change

Your "WHAT MUST NOT CHANGE" list is preserved entirely: `daily_themes`, LLM generation logic, fallback templates, scoring, signal chips, lean-on/watch-for cascade, other edge functions, client rendering of the brief itself.

