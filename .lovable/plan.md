

## Root Cause: Duplicate Practices Between JIT and ToD Plans

### The Bug

The deduplication code at lines 1336-1347 correctly collects JIT content IDs, and the main ToD selection path at lines 1409-1411 correctly filters them out. **However, there is a fallback path that bypasses this filter entirely.**

At lines 1427-1431, when `selectContent` returns `null` for an evening ToD module (because the filtered pool is too small), the code falls back to searching the **original unfiltered `enrichedContent`** list:

```typescript
// Line 1430 — BUG: uses enrichedContent, not todCandidates
const fallbackItem = enrichedContent.find((c: any) => c.category === fallbackCategory);
```

This means: if "Resilience Through Brave Action" was selected for the JIT plan, removed from `todCandidates`, and then `selectContent(todCandidates, ...)` returns `null` (because no other mindset micro-practices remain), the evening fallback grabs it right back from the unfiltered list.

Additionally, `todCandidates` is currently scoped inside the `else` block (line 1407), making it unavailable to the fallback branch.

### Fix

**File: `supabase/functions/generate-mastery-plan/index.ts`**

1. **Move `todCandidates` computation outside the per-module loop** (before line 1380), so it's available to both the main selection path and the evening fallback.

2. **Change the evening fallback** (line 1430) to use `todCandidates` instead of `enrichedContent`.

This is a 2-line structural change in the edge function. The deduplication logic itself is correct — it just has this one bypass path.

