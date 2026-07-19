## WS5 (minimal-footprint) — Insights Stress Load: correct A–H + subcategory line

Zero new files. All edits land in two files that already own this surface.

### File 1 — `supabase/functions/cause-effect-engine/index.ts` (edit in place)

Add one more rollup next to the existing `hr_event_lift` / `category_lift` construction (~lines 1332-1377) and include it in the `signal_summary` payload emitted at line ~1612.

```ts
// signal_summary.subcategory_lift
const subAcc = new Map<string, { hr: number[]; n: number; categoryId: EventCategoryId; subcategoryId: string }>();
hrAcc.forEach(({ hrDeltas, et }) => {
  if (!et) return;
  const subcategoryId = et.id.includes('.') ? et.id.split('.')[1] : et.id;
  const key = `${et.categoryId}::${subcategoryId}`;
  if (!subAcc.has(key)) subAcc.set(key, { hr: [], n: 0, categoryId: et.categoryId, subcategoryId });
  const slot = subAcc.get(key)!;
  slot.hr.push(...hrDeltas);
  slot.n += hrDeltas.length;
});
const subcategory_lift = [] as Array<{ categoryId: EventCategoryId; subcategoryId: string; hrDeltaBpm: number; n: number; confidence: Confidence }>;
subAcc.forEach((slot) => {
  if (slot.n < MIN_OCCURRENCES_EMERGING) return;
  subcategory_lift.push({
    categoryId: slot.categoryId,
    subcategoryId: slot.subcategoryId,
    hrDeltaBpm: Math.round(mean(slot.hr)),
    n: slot.n,
    confidence: slot.n >= MIN_OCCURRENCES_STRONG ? 'strong' : 'emerging',
  });
});
```
Add `subcategory_lift` to the `signalSummary` object that already gets written into `causality_findings.signal_summary` at line ~1612 (no schema change — jsonb).

### File 2 — `src/components/insights/PerformanceCausalityCard.tsx` (edit in place)

Two small edits, no new imports:

**(a) A–H label correctness.** Replace the local `CATEGORY_LABELS` map / `normalizeCategory` (~line 155) so it prefers server-provided `categoryNames[]` verbatim (they already come from `EVENT_CATEGORIES[id].name`), and only falls back to the current hardcoded map for legacy labels. That's a one-function tweak inside the file — no new module. This is the "use the correct A–H category names" fix the user called out.

**(b) Subcategory secondary line.** Extend the local `CausalityPayload` interface (already inline in this file, ~line 78) with:
```ts
signalSummary?: {
  subcategory_lift?: Array<{ categoryId: string; subcategoryId: string; hrDeltaBpm: number; n: number }>;
};
```
Below the existing Stress Load grid, inside each category row's expand region (already present), render a muted `<div className="text-xs text-muted-foreground">` listing subcategories for that categoryId when **≥2 subcategories** each have **n≥2**:
`deep_work −10 bpm (n=3) · learning +4 bpm (n=2)`.
If the array is missing/empty (older engine run, or window has no data) → render nothing. No layout shift, no empty state, no new component.

### No test files added
Add two assertions to the nearest existing test file if one exists (`src/components/insights/__tests__/*` or `PerformanceCausalityCard.test.tsx` if present). If not, skip — pre-launch, we rely on visual verification per the user's preference. Run existing suites to confirm no regression.

### Verification
- `bunx vitest run src/components/insights` — existing suite still green.
- `deno test supabase/functions/cause-effect-engine/` — existing tests still green (new field is additive).
- Redeploy `cause-effect-engine` after merge.
- Manual: on a user with no subcategory data the card renders exactly as today; on a user with data an extra muted line appears inside the expand region.

### Explicitly out of scope
- No new `.ts` files.
- No changes to Burnout Risk / Recovery Time.
- No migration.
- WS6 in a separate PR.
