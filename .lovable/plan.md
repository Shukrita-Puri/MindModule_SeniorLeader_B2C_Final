Root cause found.

The card is visible, but it is rendering an old empty backend payload:

```text
causality_findings
user: google-oauth2|111878424918915566691
computed_for_date: 2026-04-26
created/updated: 15:02
lensA: 0
lensB: 0
lensC: 0
lensD: 0
top: null
coverage: 50 check-ins · 6 wearable days · 33 briefs · 11 events
```

That exact coverage line is what your screenshot shows. So the UI is not failing to mount; it is faithfully showing a stale cached empty result.

Why it did not update after the last fix:

1. The engine checks the daily cache first.
2. The UI calls `cause-effect-engine` without `{ force: true }`.
3. Because today’s cached row already exists, the engine returns the old empty payload for 24 hours and never reaches the newer v2 calculation logic.
4. The old cached payload also lacks newer coverage fields like `eventTypesIdentified` and `hasWearableSleep`, so the empty state stays generic instead of explaining what failed.

There are also two calculation issues that should be corrected so the fresh result is credible:

- Calendar queries currently include future events because they only filter `start_time >= windowStart`, not `start_time <= now`. Future events like Apr 27-May 1 are being included in event buckets even though no check-ins or physiology can exist yet.
- Event classification order puts broad networking terms before school/governor terms, so “LSE School Governor Scheme - April Info Session” is likely classified as Networking instead of School & family.

What the real data says right now:

- Physiology cannot produce a valid calendar→HRV/RHR finding yet because wearable HRV/RHR rows are Apr 7-15, while calendar events are Apr 21 onward. There is no overlap.
- Sleep cannot produce a valid finding because there are 0 sleep records.
- Cognition does have a candidate pattern: School/family-type event days show a Confidence drop around 2.25/5 vs 3.16/5 baseline across 4 check-ins, which should qualify as an “Emerging” cause→effect finding once the stale cache and future-event logic are fixed.

Implementation plan:

1. In `PerformanceCausalityCard.tsx`, request a fresh calculation when the returned cached payload is empty:
   - First call normally for speed.
   - If `cached === true` and `top === null` and all lens arrays are empty, immediately retry with `{ force: true }` once.
   - This prevents stale empty results from persisting all day after logic changes or new data arrival.

2. In `cause-effect-engine`, stop future events contaminating the calculation:
   - Add `lte('start_time', nowIso)` to `calendar_events`.
   - Use completed event days only for event-type buckets, calendar-load tertiles, and heavy-day streaks.

3. Improve event classification priority:
   - Move “School & family” before broad “Networking & community”.
   - Keep the attendee-count fallback so events still land in a bucket.

4. Add engine-side stale-cache protection:
   - If a cached payload is empty and lacks the new v2 coverage fields, treat it as stale and recompute automatically.
   - Optionally include a `version: 2` field in payloads so future logic changes can invalidate old cache safely.

5. Make the empty state more useful if a fresh compute still has no findings:
   - Show lens-level reasons even when no top finding exists, instead of only “Patterns are still forming.”
   - Example: “Cognition has enough data; no completed event type cleared threshold yet. Physiology needs calendar/wearable date overlap. Sleep has 0 records.”

6. Validate end-to-end after implementation:
   - Force recompute for the signed-in user.
   - Confirm `causality_findings` updates from the old 15:02 empty payload.
   - Confirm the Patterns page either shows the emerging cognition finding or a specific, data-honest reason per lens.
   - Confirm preview/mock behavior still works when unsigned in.