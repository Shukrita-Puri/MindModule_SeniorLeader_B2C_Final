

## Add non-intrusive feedback row to the Performance Readiness Brief card

### Goal

Add a small thumbs row (👍 / ⚌ / 👎) to the bottom-right of the Performance Readiness Brief. Tapping any icon expands an inline `FeedbackCapture` block (textarea + Submit/Skip) inside the card itself — never a modal, never blocking the screen. After submit, the row collapses to a quiet "Feedback noted ✓" line. Once given for the day, the row stays in submitted state.

### UX behaviour

- **Default state:** Card renders exactly as today, plus a subtle right-aligned row at the very bottom: `Was this brief useful?  [👍] [⚌] [👎]` in muted-foreground/50, no border above (just `mt-4 pt-3` separator).
- **On click:** Selected icon fills with taupe; the row inline-expands an embedded `FeedbackCapture` (variant `default`, no rating prompt — rating already chosen, just textarea + Submit/Skip). 250ms slide-in.
- **On submit:** Block collapses → replaced by `✓ Feedback noted` (muted, 12px), persists for the day.
- **On skip:** Returns to default thumbs row, no rating recorded.
- **Persistence:** `localStorage` flag `prb-feedback-{YYYY-MM-DD}` so the row stays in submitted state across reloads. DB write is fire-and-forget (no spinner, no toast).

### Backend

The existing `content_relevance_feedback` table has a CHECK constraint that only permits `soundbath`/`guided-practice`/`micro-practice` for `content_type`. The current `submitPlanFeedback('tod'/'jit')` writes are being silently dropped (verified: zero `plan-*` rows exist).

**Migration:** Drop the constraint and re-add it with `'brief'`, `'plan-tod'`, `'plan-jit'` included — fixes the brief path AND repairs the existing plan-feedback write that's been failing silently.

```sql
ALTER TABLE content_relevance_feedback
  DROP CONSTRAINT content_relevance_feedback_content_type_check;
ALTER TABLE content_relevance_feedback
  ADD CONSTRAINT content_relevance_feedback_content_type_check
  CHECK (content_type IN ('soundbath','guided-practice','micro-practice','brief','plan-tod','plan-jit'));
```

### New helper: `submitBriefFeedback`

In `src/utils/relevanceFeedback.ts`:

```ts
export async function submitBriefFeedback(
  rating: 'up' | 'neutral' | 'down',
  feedback?: string,
  briefSnapshotId?: string,
)
```

Maps `up→5, neutral→3, down→1`, posts to `content-feedback` edge function with:
- `content_id: 'prb-' + YYYY-MM-DD`
- `content_type: 'brief'`
- `feedback_type: 'star_rating'`
- `trigger_context: 'brief_inline'`
- `context_data: { feedback_scope: 'brief', brief_snapshot_id, tier, score }`

Fire-and-forget (no await on UI), errors logged in DEV only.

### Component changes

**`src/components/home/DecisionReadinessBrief.tsx`** — add at end of card (after Collapsible "How to show up", inside the outer `<div>`):

- New `BriefFeedbackRow` sub-component encapsulating the three states (`idle` / `capturing` / `submitted`).
- Uses `FeedbackCapture` with `variant="default"`, hides the rating prompt (rating is set by the row click), only shows the textarea + Submit/Skip.
- Reads/writes `localStorage['prb-feedback-' + dateKey]` to start in `submitted` state if already given today.
- Passes `outerBrief?.briefSnapshotId` (if available — otherwise undefined) for traceability.

### Files touched

- `src/components/home/DecisionReadinessBrief.tsx` — add `BriefFeedbackRow` and render at card bottom
- `src/utils/relevanceFeedback.ts` — add `submitBriefFeedback`
- `supabase/migrations/<timestamp>_brief_feedback_content_type.sql` — relax CHECK constraint
- `src/components/feedback/FeedbackCapture.tsx` — small additive prop `hideRatingPrompt?: boolean` so the inline expansion can suppress the prompt + icon row (rating already chosen above)

### Out of scope

- No modal, no toast, no full-screen takeover
- No changes to LLM, validators, or pillar logic
- No auto-prompting or nagging (one chance per day, silent if ignored)
- No analytics dashboard surface for this data yet (data lands in `content_relevance_feedback`, queryable later)

