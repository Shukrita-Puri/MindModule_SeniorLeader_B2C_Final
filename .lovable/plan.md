

# Fix Personal Block Filter + Unify Signal · Source Format

## 2 Changes

### 1. Keep personal block filter keyword-only (no attendee guard)

**File:** `supabase/functions/compute-outer-readiness/index.ts`

The current logic is already correct — `personalBlockPatterns` filters purely by keyword (lines 207, 230, 244). The previous plan proposed adding an attendee guard (`&& attendees_count <= 1`), but the user correctly identifies this is wrong: a calendar entry titled "Day Block - Prepare for Interview" is still a personal block regardless of attendees — it's prep time the user carved out.

The real meeting count issue is likely elsewhere (timezone filtering or the `isMeeting` function's `dur > 240 && att <= 1` secondary filter). We should **not** change the keyword filter.

**Action:** No change to `personalBlockPatterns`. Instead, investigate the actual meeting count discrepancy by testing the edge function with the user's data to see what events are being counted vs filtered.

### 2. Force ALL leanOn/watchFor to use `signal · source` format everywhere

**Root cause:** The fallback at lines 3741/3744 passes `leanOnResult.leanOn` raw when `llmLeanOn` is null. The `getLeanOnWatchFor()` function (lines 1699-1819) returns strings like:
- `"Your stillness instinct (archetype)"` 
- `"Absorbing others' energy (archetype)"`
- `"Your state awareness (readiness)"`
- `"Coach strength text (coach)"`
- `"CC modifier text (check-in)"`

These use parentheses `(source)` instead of ` · Source`. The client parser expects ` · `.

**Fix — two parts:**

**Part A: Reformat `getLeanOnWatchFor()` return values** (lines 1742-1819)

Change all `(source)` patterns to ` · Source`:
- `"${coachStrength} (coach)"` → format at output
- `"${base.leanOn} (archetype)"` → format at output
- `"${ccMod.leanOn} (check-in)"` → format at output
- `"${base.leanOn} (readiness)"` → format at output

But the cleaner fix is **Part B**:

**Part B: Fix the fallback formatter** (lines 3739-3744)

Instead of passing `leanOnResult.leanOn` raw, always reformat it into `signal · source`:

```typescript
const formattedLeanOn = llmLeanOn
  ? llmLeanOn.map(item => `${item.signal} · ${item.source}`).join('\n')
  : formatFallbackSignal(leanOnResult.leanOn, leanOnResult.source);

const formattedWatchFor = llmWatchFor
  ? llmWatchFor.map(item => `${item.signal} · ${item.source}`).join('\n')
  : formatFallbackSignal(leanOnResult.watchFor, leanOnResult.source);
```

Where `formatFallbackSignal` is:
```typescript
function formatFallbackSignal(text: string, source: string): string {
  // Strip existing parenthetical source if present
  const cleaned = text.replace(/\s*\([^)]+\)\s*$/, '').trim();
  // Truncate to max 3 words
  const signal = cleaned.split(' ').slice(0, 3).join(' ');
  // Map source key to human label
  const sourceLabels: Record<string, string> = {
    'archetype-tier': 'Archetype',
    'tier-fallback': 'Readiness',
    'coach-insights-recent': 'Coach',
    'coach-insights-grace': 'Coach',
    'coach-partial-strength': 'Coach',
    'coach-partial-growth': 'Coach',
    'cc-modifier': 'Check-in',
    'cc-modifier-with-context': 'Check-in',
    'sunday-evening-override': 'System',
    'evening-recovery-override': 'System',
    'wearable-recovery-override': 'Wearable',
  };
  return `${signal} · ${sourceLabels[source] || 'System'}`;
}
```

This solves Issue 3 (long archetype strings) automatically via the 3-word truncation, so no need to manually edit every archetype matrix entry.

**Also fix the P-1 wearable recovery fallback** (lines 1742-1748): those `leanOn`/`watchFor` values are full prose sentences. The same `formatFallbackSignal` will truncate them to 3 words + source.

### 3. Audit meeting count with live data

**Action:** After deploying the format fix, test the edge function with the user's auth to inspect the actual calendar events being processed — specifically what `isMeeting()` returns for each event, to find why the count shows 2 instead of 3+.

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/compute-outer-readiness/index.ts` | Add `formatFallbackSignal()` helper; update lines 3739-3744 to use it for fallback formatting |

## Implementation Order

1. Add `formatFallbackSignal()` helper function
2. Update fallback formatting at lines 3739-3744
3. Deploy edge function
4. Test with user's auth token to audit meeting count
5. Update docs

