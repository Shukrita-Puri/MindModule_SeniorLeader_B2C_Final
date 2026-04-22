

## Plan: Refine "Generate Today's Plan" CTA timing, label, and placement

Three small changes to the `/executive-home` CTA below the Performance Readiness Brief. No logic, scoring, prompts, or data flow changes.

---

### 1) Rename label

Change CTA text from `Activate Today's 3 Priorities` → **`Generate Today's Plan`**. Same icon (`ArrowRight`), same navigate target (`/plan`).

### 2) Right-align below the brief

Currently the button is full-width (`w-full`). Move it to the **right side**, below the brief card, so it visually reads as "go to next page".

- Replace the wrapping container so the button sits in a right-aligned flex row: `mt-3 flex justify-end`.
- Button itself becomes auto-width with comfortable padding: drop `w-full`, use `h-11 px-5 bg-taupe text-white hover:bg-taupe/90 rounded-lg`.
- Keep the fade-in animation (`animate-in fade-in duration-300`).

### 3) Fix reveal timing — only show 5s AFTER brief is fully loaded

**Current behavior (the bug):**
- The 3.5s timer in `DecisionReadinessBrief.tsx` is gated by `phrase` and starts when the brief component renders post-loader. But there's also a localStorage fast-path (`prb-feedback-{briefId}`) that calls `setShowCta(true)` immediately on mount if the user has previously submitted feedback for this brief. On refresh, that fires before the loader script finishes — and because the parent's `briefCtaReady` state persists, the button can appear before/during the loader.
- Additionally, the duration is too short (3.5s) — user wants 5–7s.

**Fix in `src/components/home/DecisionReadinessBrief.tsx`:**

a) **Gate the CTA reveal on the loader being done.** Replace the existing `showCta` `useEffect` so that:
- If the loader is still showing (`showLoader === true`), `setShowCta(false)` and return.
- Otherwise (loader finished + brief content rendered), start a single 5-second timer to flip `setShowCta(true)`.
- Remove the localStorage fast-path that bypasses the timer on refresh — the user explicitly wants the brief to be visible for 5s before the CTA appears, every time.
- Keep the `BriefFeedbackRow.onFeedbackSubmitted={() => setShowCta(true)}` short-circuit (so submitting feedback still reveals the CTA immediately — that path is user-initiated, not a stale-cache surprise).

b) **Force-reset on cold mount.** Initialize `showCta` to `false` and ensure `onCtaReadyChange?.(false)` fires immediately on mount so the parent `briefCtaReady` cannot remain `true` from a prior render cycle.

c) **Bump the timer from 3500ms → 5000ms** (5 seconds, within the 5–7s window the user requested; 5s feels responsive while still giving time to read).

The net flow becomes:

```
Loader (script-gated, plays all 4 narration steps)
   ↓ briefScriptDone = true
Brief card renders fully
   ↓ wait 5000ms
"Generate Today's Plan" button fades in (right-aligned, taupe)
```

---

### Files touched

| File | Change |
|---|---|
| `src/components/home/DecisionReadinessBrief.tsx` | Replace the `showCta` effect: gate on `showLoader === false`, remove localStorage fast-path, bump delay to 5000ms, ensure clean reset on mount. Keep `onCtaReadyChange` contract identical. |
| `src/pages/ExecutiveHome.tsx` | Change CTA label to "Generate Today's Plan". Wrap in `mt-3 flex justify-end`. Drop `w-full`, use auto-width taupe button (`h-11 px-5`). |

---

### What does NOT change

- Loader script, narration steps, data fetching, brief content, scoring, prompts, validators.
- Brief card layout, headers, signals collapsible, How-to-show-up section, feedback row.
- Plan page, navigation, routing.
- Any other consumer (none — `PerformanceReadinessBrief` and the CTA are single-use here).
- DB / edge functions / RLS.

---

### Verification

1. Hard refresh `/executive-home`: loader plays through all 4 narration steps, then the brief card animates in fully. **No CTA visible during loader.**
2. After the brief is fully visible, wait 5s — the **"Generate Today's Plan"** button fades in on the **right side** below the brief card.
3. Click it → navigates to `/plan`.
4. Submit brief feedback before 5s elapses → CTA appears immediately (feedback short-circuit preserved).
5. On a refresh after previously giving feedback for the same brief, the CTA still waits the full 5s after loader completes (no stale-cache early-show).

