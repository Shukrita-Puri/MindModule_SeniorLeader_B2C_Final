## Bug: `classifyInterview` returns `'none'` for bare "Interview" with <2 attendees

**File:** `supabase/functions/_shared/jit/select-jit.ts:122`

### Current behaviour (verified)
```ts
if ((args.attendeesCount ?? 0) < 2) return 'none';
```
A bare "Interview" event with `attendeesCount: 1` (or 0/unknown) is rejected entirely — even though line 110 already confirmed the title matches `INTERVIEW_RE`. This drops real high-stakes events from JIT scoring and fails the existing test at `select-jit.test.ts:475` which expects `'ambiguous'`.

### Contract note (why not Path A from the ticket)
`classifyInterview` returns `InterviewKind = 'media' | 'candidate' | 'hiring' | 'ambiguous' | 'none'` — **not** an A–H category. Returning `'D'` (as the ticket's "Path A" suggests) would break the type and every downstream caller (`interviewBoost`, etc.). Category assignment happens separately; `InterviewKind` only controls the interview-specific score boost.

The correct alignment with the test and the ticket's underlying intent ("don't gate real events out; keep them in the Plan") is **Path B / Path C**: return `'ambiguous'` so the event still flows through JIT with the `+8` ambiguous boost, and still receives normal category classification + pre/post arcs upstream.

### Change

Replace line 122 with:

```ts
// Bare "Interview" titles with unknown/placeholder attendee counts are still
// real events — don't gate them out. Fall through to 'ambiguous' so the
// event keeps its category (D) + pre/post arcs and gets a modest boost.
if ((args.attendeesCount ?? 0) < 2) return 'ambiguous';
```

Then let the media / direction / hiring-keyword branches below run only when `attendeesCount >= 2` by wrapping the remaining logic in an early return path, OR (simpler) leave the branches as-is — they're all keyword/domain driven and safely produce more specific kinds when signals exist. The bare "Interview" with count<2 and no other signals will hit `'ambiguous'` via the new early return above **only if** we return early; to keep the more specific branches available when title/domain signals do exist, restructure as:

```ts
const hasStrongSignals =
  args.subtypeId === 'media-publication' ||
  args.categoryId === 'C' ||
  MEDIA_INTERVIEW_RE.test(title) ||
  HIRING_KEYWORD_RE.test(title) ||
  args.subtypeId === 'hiring-loop';

if ((args.attendeesCount ?? 0) < 2 && !hasStrongSignals) return 'ambiguous';
```

This preserves existing test behaviour for `"CNBC interview with David"` (media, count 2 — unaffected) and `"Interview with CEO at Stripe"` (already returns `'candidate'` via `MY_INTERVIEW_TITLE_RE` before line 122).

### Verification
- Existing test at `select-jit.test.ts:475` (`"bare ambiguous interview falls through to ambiguous"`) now passes.
- Run full Deno suite: `deno test supabase/functions/_shared/jit/` — expect 180/180.
- No frontend or DB changes; no migrations; no redeploy required beyond the shared module (it's imported by `generate-mastery-plan`, `smart-nudges`, `list-week-ahead-priorities`, so redeploy those three).

### Out of scope
- Ticket's "Path C" (context-aware `D.hiring_interview` subtype) — the enrichment/subtype layer already handles this in WS1-2 via `classify-event-v2`. No change needed here.
- Any changes to category assignment or arc generation — those already work correctly for D events.

### Files touched
1. `supabase/functions/_shared/jit/select-jit.ts` — one-line/small-block change at line 122.
2. Redeploy: `generate-mastery-plan`, `smart-nudges`, `list-week-ahead-priorities`.
