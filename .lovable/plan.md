

## Plan: Brief CTA upgrade + real Heart Rate signal

### Part 1 — Brief → Plan handoff CTA (visual upgrade)

**Current:** quiet right-aligned link `View today's 3 priorities →` with `Built from this brief` subtext under the brief, plus a separate post-feedback link.

**New:** a single **full-width orange (saffron) button** at the bottom of the brief card.

- Label: **"Activate Today's 3 Priorities"** (crisper than the suggested phrase; ties cleanly to the existing "Today's 3 Mental Performance Priorities" page title).
- Width: 100% of the brief card, same horizontal inset as the chips/feedback row above it.
- Color: the app's existing critical accent — `bg-saffron text-white`, matching the `critical` button variant already defined in `src/components/ui/button.tsx` (Saffron #ff825a per `mem://brand/color-palette/button-roles-v3`). Hover lift + active scale already wired into that variant.
- Height: standard `h-11` (≥44px tap target) with the executive rounded-lg corners.
- Click → `navigate('/plan')`.
- **Reveal timing:** appears with a 3.5s delay after the brief finishes rendering, fading in (250ms). Implementation: a `useEffect` in `PerformanceReadinessBrief` that flips a local `showCta` flag `setTimeout(..., 3500)` once `outerBrief` is non-null AND `phrase` text is present. The 3.5s window lets the user read the brief.
- **Override — feedback short-circuit:** the moment the user submits brief feedback (any rating), the CTA is forced visible immediately if not already shown. Wiring: `BriefFeedbackRow` calls a new `onFeedbackSubmitted` prop passed from the parent which sets `showCta = true`. So users who engage with feedback see the button without waiting out the timer.
- **Persistence:** once revealed, the CTA stays visible for the rest of the session (no re-hiding on refresh — controlled by the same per-brief storage key already used by `BriefFeedbackRow` so a previously-fed-back brief shows the CTA instantly on reload).

**Removed:**
- The current "View today's 3 priorities → / Built from this brief" right-aligned link block.
- The post-feedback `Noted — your 3 priorities are ready →` mini-link inside `BriefFeedbackRow`. Its submitted state collapses back to a quiet `✓ Feedback noted` (the CTA below now carries the forward action — no duplication).

### Part 2 — Real Heart Rate in the Physiology pill

**You're right, my prior message was wrong.** HealthKit *is* syncing real `heart_rate` (daily average bpm) into `wearable_data.heart_rate` (`src/services/wearableSyncService.ts` line 277 → column exists, 3 rows already populated). The brief was showing an RHR-derived "proxy" only because `compute-outer-readiness` never SELECTed the column. Fix: plumb the real value end-to-end.

**Changes:**

1. **`supabase/functions/compute-outer-readiness/index.ts`**
   - Line 1863 SELECT: add `heart_rate` to `select('hrv, resting_heart_rate, heart_rate, sleep_score, total_sleep_minutes, source, summary_date')`.
   - Same for the 30-day baseline query (~line 2322): add `heart_rate`.
   - Capture `const hr = wearableRow.heart_rate ?? null;` and add `hr` + `hrBaseline` + `hrDeviation` to `wearableContext`.
   - Compute `hrBaseline` (30-day average where `heart_rate IS NOT NULL`, min 3 rows) and `hrDeviation` (`((hr - baseline)/baseline) * 100`).
   - Replace the HRV-only `hrElevated` heuristic (line 1891) with a real check: `hr != null && hrDeviation != null && hrDeviation > 10`. Keep the HRV heuristic only as fallback when `hr == null`.
   - Add to the response payload (around line 4156–4170): `hrValue: hr`, `hrBaseline`, `hrDeviation`, plus `hr: hr != null` in the `hasMetrics` block.

2. **`src/components/home/DecisionReadinessBrief.tsx`** — Physiology pill HR line (currently lines 929–941, the proxy block):
   - Pull `hrVal`, `hrDev`, `hrBaseline` from `outerBrief`.
   - When `hrVal != null`: render `HR ${hrVal}bpm` as the line text, with qualifier `${devSign(hrDev)}% vs ${hrBaseline}bpm baseline · ${state}` where state is `calm` / `rising` / `elevated` based on real deviation thresholds (≤10% calm, 10–20% rising, >20% elevated). Tier color follows the same thresholds.
   - Fallback (no `heart_rate` row): keep the existing RHR-deviation-derived `HR — calm/rising/elevated` proxy text but tag the qualifier with `· estimated` so the user knows it isn't a direct HR reading.
   - Same swap inside `hrElevatedContrib()` (line 689) for the pillar scoring engine: prefer real `hrDev` when available, fall back to RHR-derived signal otherwise. No scoring weight changes.

3. **Memory update:** edit `mem://features/wearable/hr-elevated-proxy-logic` to record that real `heart_rate` is now sourced when present and the RHR-derived proxy is fallback-only.

### What I meant in my previous message (and was wrong about)

I said "this is a display fix only … HR proxy derived from RHR-deviation" because I assumed `wearable_data` had no `heart_rate` column. That was outdated — the column was added, HealthKit writes to it, but `compute-outer-readiness` never SELECTed it. So the pill *was* showing a derived estimate dressed up as HR. This plan corrects that by actually exposing the real value and only falling back to the proxy when a row genuinely lacks `heart_rate`.

### Files touched

| File | Change |
|---|---|
| `src/components/home/DecisionReadinessBrief.tsx` | Replace right-aligned handoff link + post-feedback mini-link with full-width saffron `Activate Today's 3 Priorities` button. Add 3.5s reveal timer + immediate-reveal-on-feedback. Plumb real `hrValue` / `hrDeviation` into Physiology HR line, fall back to current proxy when null. |
| `supabase/functions/compute-outer-readiness/index.ts` | Add `heart_rate` to SELECTs (current + baseline). Compute `hrBaseline` + `hrDeviation`. Expose `hrValue`, `hrBaseline`, `hrDeviation` on response. Refine `hrElevated` flag using real HR. |
| `mem://features/wearable/hr-elevated-proxy-logic` | Update to reflect real-HR-first + proxy-fallback. |

No DB migration (column already exists). No new routes. Plan-page handoff path is unchanged.

### Verification

1. `/executive-home`: brief renders, CTA is hidden for ~3.5s, then a full-width saffron button `Activate Today's 3 Priorities` fades in. Tap → `/plan`.
2. While CTA is hidden, submit brief feedback (👍/⚌/👎 → Send) → CTA appears immediately, doesn't wait out the timer. Feedback row shows quiet `✓ Feedback noted`.
3. Refresh the page after feedback was submitted → CTA renders instantly (no 3.5s wait), feedback row stays in submitted state.
4. Mobile 375px: button is full card-width, hit area ≥44px, no overflow.
5. Physiology pill: when `wearable_data.heart_rate` is populated for today, HR line reads e.g. `HR 72bpm · +12% vs 64bpm baseline · rising`. When the column is null for today's row, fallback line reads `HR — rising · estimated · sympathetic activation building`.
6. Pillar tier colour for Physiology continues to behave identically when only proxy data is available (no regression).
7. Brief feedback persistence (`prb-feedback-{briefId}`) still works: same brief never asks twice in a session.

### Out of scope

- Changing Physiology Sleep/RHR display (untouched).
- Changing pillar scoring weights or thresholds (only data source for `hrElevated` updated).
- Redesigning `BriefFeedbackRow` mechanics beyond the submitted-state copy and the new `onFeedbackSubmitted` callback.
- Animating the CTA beyond simple fade-in.

