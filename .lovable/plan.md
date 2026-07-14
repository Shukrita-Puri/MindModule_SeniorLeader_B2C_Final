
# Staged Smart Nudges + Plan Pipeline Rollout

Every stage is gated: implement → verify with real evidence → report → wait for go-ahead. No stage batching. Stage 1 has the widest blast radius (Plan card + all 3 nudges + Insights), so Stage 0 is a mandatory diagnostic before any code change.

## Stage 0 — Diagnostic only (no code changes)

Run the widened `mastery_plan_snapshots` query across morning/afternoon/evening for the last 3 days via `supabase--read_query`:

```sql
SELECT user_id, plan_date, mrs_window,
       jsonb_array_length(COALESCE(horizon_modules, '[]'::jsonb)) AS hm_count,
       jsonb_array_length(COALESCE(plan_json->'horizonModules', '[]'::jsonb)) AS pj_hm_count,
       jsonb_array_length(COALESCE(plan_json->'timeOfDayPlan'->'modules', '[]'::jsonb)) AS pj_tod_count,
       generated_at
FROM mastery_plan_snapshots
WHERE plan_date >= CURRENT_DATE - INTERVAL '3 days'
ORDER BY plan_date DESC, mrs_window, generated_at DESC
LIMIT 60;
```

Classify each window as:
- **Shape A** (already-diagnosed): `hm_count=0`, `pj_hm_count=0`, `pj_tod_count>0` — practices computed but not projected to `horizon_modules`.
- **Shape B** (new defect): `pj_tod_count=0` — server not even computing practices.

Report per-window shape. If any window is Shape B, STOP and flag for separate root-cause investigation before Stage 1.

**Deliverable:** table of shapes by window + go/no-go for Stage 1.

## Stage 1 — Fix `horizon_modules` persistence gap (P0)

Only if Stage 0 confirms Shape A (uniform).

Trace `supabase/functions/generate-mastery-plan/index.ts` from `buildHorizonModules(...)` to the final upsert. Locate (by content, not line number) where projected modules are dropped or overwritten before write. Suspects per prior root-cause report: `finalHorizonModules` persistence, ledger merge, enrichment pass.

Fix at the narrowest point that closes the gap.

**Do NOT touch:** `allocatePlanSlots`, `mergeWithLedger` allocator-context handling, why-line LLM, practice-selector scoring, `_shared/plan/*`, any nudges code.

**Verification (must be real, not synthetic):**
1. Re-run Stage 0 query for a test user after forcing regeneration in all three windows → `hm_count > 0`.
2. Plan card renders real priorities (not rest-day fallback) in all three windows.
3. 24h of `notification_log` shows `nudge_two` reappearing.
4. At least one real day across a sample of users holds the fix.

**Rollback:** single-PR revert. No schema.

## Stage 2 — Rekey `sentSlotsToday` on `QualifiedNudge.slot` (P1)

Only after Stage 1 verified stable. `smart-nudges/index.ts` ~L4431–4441: replace `slotForType()` string-prefix inference with the existing `slot` field on `QualifiedNudge`.

**Do NOT touch:** notification_type taxonomy, delivery, suppression windows, caps.

**Verification:** query recent `notification_log`/traces; confirm a `nudge_one_*`-tagged nudge that actually fired in the afternoon now occupies the afternoon bucket.

## Stage 3 — Medium priority (one at a time)

- **3a.** Wire `travel-notifications` to read Plan `horizon_modules` full-arc entries instead of re-deriving Pre/During/Post. Gated on Stage 1.
- **3b.** Quiet-window/DND in `circadianTimezone` when `isAway` && days-since-arrival ≤ 2 — conditional only, don't change default path.
- **3c.** Replace inline back-to-back logic in `evaluateNudgeTwo` with `meetingPrepCliff` from `_shared/ceo-behaviour/back-to-back.ts`; verify parity on known cases before deleting inline version.

Each with its own verification + go/no-go.

## Stage 4 — Low priority additive

- **4a.** `sync_wearable` nudge for `readinessState==='awaiting'` ≥24h + no wearable connection; respects daily cap (3) and per-tick (1).
- **4b.** Monthly Insights nudge on second-last day of month; respects caps.
- **4c.** cos_profile prefs into nudge copy — first check existing `leaderProfile`/`leaderVoiceRules` wiring; only add what's genuinely missing.
- **4d.** Static-fallback templates: reorder any that lead with a bare metric to lead with meaning.

## Reporting contract (every stage)

1. Files changed + brief description.
2. Verification evidence (query result / log excerpt / before-after) — not "deployed".
3. Confirmation the "do NOT touch" list held.
4. Explicit go/no-go for the next stage.

Stop immediately on any unclean verification; do not chain stages.

---

**Starting point on approval:** Stage 0 only — run the diagnostic query and report shape classification per window. No code edits.
