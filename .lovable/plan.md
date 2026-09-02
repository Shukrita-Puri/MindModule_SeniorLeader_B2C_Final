# iOS vs Web: why the awaiting state diverges on Executive Home

Audit finding first, then a scoped iOS-first fix. No changes to MRS scoring, brief generation, plan selection or backend logic.

## What the audit found

Web and iOS run the same gating code (`isMrsVisible`, shared awaiting copy). The divergence is not in the gate — it is in **when the iOS shell re-evaluates it**. Web reloads the page on every visit, so every card re-derives today's date, the current window and fresh data. The iOS WKWebView is mounted once at launch and stays alive for days.

Three confirmed consequences on iOS:

1. **No window/day rollover.** The date and window are computed during render (`localISODate()`, `currentPeriod()`), and they feed the query keys for MRS snapshot, brief and plan. Nothing re-renders the tree when the clock crosses 12:00 / 18:00 / midnight, so the app keeps serving yesterday-morning's keys — and yesterday's score and brief — indefinitely.

2. **Resume does not refresh the cards that matter.** On foreground resume the app only invalidates `outer-readiness` and `mrs-weekly-delta`, and only when an Apple Calendar sync succeeds. `mrs-snapshot`, the brief snapshot and the mastery-plan snapshot are never invalidated on resume.

3. **Sticky "last good" state survives forever.** The brief keeps a `lastGoodBriefRef`, MRS keeps an in-memory `lastGoodMrsSnapshots` map, and both brief and plan hydrate from localStorage caches. These are intentional anti-flicker devices, but their expiry assumes a page lifecycle that never happens in the native shell.

That combination explains exactly what was seen: a stale MRS number and a full brief from an earlier window, then — once one query did refresh — "Writing your read", while the Plan (a different query that did refresh) correctly said signals were missing. The three cards were reading state captured at different moments.

## The fix (iOS first, web inherits it)

1. **Shared clock context.** One `useHomeClock` source that emits the current local date and window, ticks at the window boundary, and re-emits on foreground resume. Every home card reads date/window from it instead of calling `localISODate()` / `currentPeriod()` at render time, so all three cards always agree on which window they are showing.

2. **Rollover invalidation.** When the window or date changes, drop the stale keys in one place: `mrs-snapshot`, `outer-readiness`, brief snapshot, mastery-plan snapshot, plus the in-memory last-good caches and the localStorage brief/plan entries for the window just left.

3. **Resume invalidation, unconditional.** A single foreground-resume handler invalidates the three executive-home queries regardless of whether calendar sync ran or succeeded. Debounced so several resume listeners can't stampede.

4. **Scope last-good to the live window.** The last-good brief ref and the MRS last-good map are cleared when the clock context changes window, so anti-flicker can never carry a formed score across a boundary into a window that has no signals.

## Verification

- Native run: launch on the previous window, cross the boundary with the app foregrounded and again from background, confirm all three cards flip to the same awaiting state together.
- Web regression check: current behaviour must be unchanged.
- Existing awaiting-parity and MRS-gate tests must still pass, plus a new test that a window change clears last-good state.

## Out of scope

No scoring, brief copy, plan selection, edge function or database changes. Presentation and data-freshness wiring only.
