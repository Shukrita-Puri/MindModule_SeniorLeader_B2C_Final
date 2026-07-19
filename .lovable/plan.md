## WS6 — Smart Nudges consume A-H subcategory + arc from Plan ledger

**Scope confirmed: enrichment only.** Every JIT-anchored nudge already fires off an existing plan slot. WS6 makes that slot's A-H category + subcategory + arc phase authoritative in the copy path so the nudge language matches what the Plan promised the user.

**Structure preserved (non-negotiable):**
- Collapsed headline stays `Mind Module` (always).
- `aps.alert.subtitle` = short moment title (≤3 words / 28 chars, `clampSubtitle`, `requiresHeadlineStructure`).
- Body = Context + CTA, obeying V8 copy contract (≤22 words, ≤140 chars, meaning-forward, qualified mind-prep CTA verb).
- No change to v8 comparator, DND, 2h suppression, daily-3 cap, week-ahead pipeline, headline/subtitle/body layering, or `ALLOWED_CTA_VERBS_V8`.

### Why this matters
Today Smart Nudges reads `jitEventTitle` + `jitPhase` + `arcLabel` from `plan_ledger`, then re-classifies the title on the fly to derive category context. That re-classification can drift from what the Plan actually committed (e.g. Plan tagged a session as `E.learning`, nudge re-derives generic `E`). WS6 lets the ledger drive both the Plan surface and the Smart Nudges copy path from the same subcategory — same alignment WS5 gave Insights Stress Load.

### Files touched (two, edit in place — no new files)

**1. `supabase/functions/generate-mastery-plan/index.ts` — stamp subcategory on every ledger module**
- At every point categoryId is already assigned to modules (~lines 8810, 8907, 9127, 10090, 10240, 10503, 10574, 10941), also stamp `anchorSubcategory` using `enrichEvent({ title }).subcategory`. Reuse the existing `enrichEvent` import; no new dependencies.
- Extend the module TypeScript shape (`jitEventTitle` / `anchorCategoryId` neighbours around 7436 / 8905) with `anchorSubcategory: string | null`.
- Zero DB migration: `plan_ledger` is jsonb; new key is additive and older rows stay valid.

**2. `supabase/functions/smart-nudges/index.ts` — read + use subcategory in Context, keep structure**
- Extend `PlanNudgeSlot` (line 627) with `categoryId: EventCategoryId | null` and `subcategory: string | null`.
- In `parsePlanSlots` (~line 560-593), read `m.anchorCategoryId ?? m.categoryId ?? null` and `m.anchorSubcategory ?? null`.
- Enrichment hooks — **body Context sharpens only; subtitle, headline, and CTA verb unchanged**:
  - **(a) Context sentence** (`buildSharedEventFrameLine` / `buildActionFrameForEvent` around 1104-1133 and 3627-3652): when the plan slot provides `subcategory`, pass it into the existing pattern lookup so `findEventPattern` cites subcategory-level lift (from `causality_findings.signal_summary.subcategory_lift`, WS5) instead of category-level average when both exist. Missing subcategory → existing category behaviour verbatim. Word/char caps and V8 validators still gate the final string.
  - **(b) Telemetry only**: add `payload.metadata.plan_ledger_category` and `payload.metadata.plan_ledger_subcategory` to `notification_log` so we can verify Plan ↔ Nudge alignment. Not user-visible.
- `NudgeSlot` selection order, cascade, `Mind Module` headline, subtitle clamp, CTA verb bucket, and V8 body validators are untouched — subcategory only sharpens the Context clause inside the existing body.

### What we deliberately do NOT do
- No change to the `Mind Module` collapsed headline, subtitle format, or "Context + CTA" body shape.
- No new nudge type, no new deep link, no new firing rule, no new copy variant.
- No new CTA verbs beyond `ALLOWED_CTA_VERBS_V8`.
- No frontend change. No Insights / Brief / Executive Home change.
- No PTO regex widening or availability logic change.

### Verification
- `deno test supabase/functions/_shared/events/event-tagging-v2.test.ts supabase/functions/_shared/plan/*.test.ts` — must stay green.
- `deno test supabase/functions/smart-nudges/` — existing suite green; add two assertions if a suitable file exists: (i) `parsePlanSlots` surfaces `categoryId` + `subcategory` when present; (ii) missing subcategory falls back to category-level pattern with no throw and unchanged body/subtitle/headline shape.
- Manual: `/functions/v1/smart-nudges?force_user=<uid>&force_dry=1` for a user whose `plan_ledger` carries `anchorSubcategory: "learning"` under category E. Confirm the dry-run `notification_log` row has `metadata.plan_ledger_subcategory = "learning"`, headline still `Mind Module`, subtitle ≤3 words, body still Context+CTA within V8 caps.
- Redeploy `generate-mastery-plan` and `smart-nudges` after merge.

### Risk
Low. Both edits are additive; missing keys on old ledger rows fall back to current behaviour. No cap, cascade, suppression, or notification structure code is modified.
