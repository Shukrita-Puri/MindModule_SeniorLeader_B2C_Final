# Restore Plan-to-MRS parity and source-aware awaiting copy

## Confirmed diagnosis

- The Plan computes the shared MRS gate, but its render order checks `showPlanLoader` before `awaitingSignals`. On a cold/awaiting window, its initial loading state can therefore win and show “Sequencing your priorities…” even after MRS and Brief have resolved to Awaiting Signals.
- Plan also retains older independent awaiting inputs (`outerReadinessData`, Brief mode, local wearable/check-in checks, and Plan snapshot status). These can disagree with the canonical MRS state.
- Both one-source-missing reasons already exist: `calendar_present_wearable_missing` and `wearable_present_calendar_missing`. Their current wording is “signal received / fuller read,” not the requested connection-aware early-read wording.
- Executive Home runs snapshot-first, and the MRS snapshot does not currently expose connection metadata. When the live readiness payload is absent, the shared copy resolver receives no source state and falls back to the generic “connect your wearable and calendar” sentence.

## Implementation

1. **Make MRS the only formed/awaiting gate for Plan**
   - Derive one `mrsVisible` boolean with the existing `isMrsVisible` helper.
   - When MRS is not visible, Plan immediately renders the shared Awaiting Signals state; it must not show the sequencing loader, a cached plan, a recovery CTA, or generate a plan.
   - When MRS is visible, preserve the existing ready Plan snapshot, rest-day, and refresh behavior.
   - Remove or subordinate Plan-only Brief/wearable/check-in gates so they cannot override the MRS decision.

2. **Resolve awaiting copy from real connection state in snapshot-only Home**
   - Add one query-cached shared connection-status source for the three executive cards instead of making separate requests per card.
   - Merge its connection facts with the existing readiness payload before calling the single `resolveAwaitingSignalsCopy` resolver.
   - Keep detailed states such as permission revoked, sync delayed, and connected-with-no-new-data higher priority than generic missing-source variants.

3. **Update and mirror the two one-source variants**
   - Calendar connected, wearable missing: “Calendar is connected. Connect your wearable to get an early read, then check in to sharpen it.”
   - Wearable connected, calendar missing: “Wearable is connected. Connect your calendar to get an early read, then check in to sharpen it.”
   - Apply the same wording in the frontend and shared backend copy sources so generated Plan responses and all three cards cannot diverge.

## Verification

- Add regression coverage proving Plan renders awaiting—not its loader—whenever `isMrsVisible` is false, including when a ready/stale Plan snapshot exists.
- Extend parity tests across MRS, Brief, and Plan for calendar-only, wearable-only, neither connected, permission-revoked, delayed-sync, and connected-no-data states.
- Run the focused parity/refresh suites and the complete frontend suite.
- If shared backend copy changes, run its focused tests and deploy only the functions that import that shared copy module.

## Scope guard

No changes to MRS scoring, signal eligibility, Brief generation, Plan selection, database schema, or refresh orchestration.