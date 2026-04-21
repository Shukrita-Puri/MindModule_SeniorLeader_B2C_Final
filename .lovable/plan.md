

## Validate, unify, and restyle FeedbackCapture across all feedback surfaces

### A. End-to-end DB validation results (what I found)

| Surface | Component today | DB write path | Status |
|---|---|---|---|
| Performance Readiness brief rating | (no UI yet — endpoint only) | `brief-rating` → `brief_snapshots.user_rating` + `feedback_text` | Endpoint live, RLS verified, ownership enforced. **Table currently has 0 rows** — snapshots only persist after a brief is generated (cache-miss path runs `upsert` fire-and-forget). Will populate on next live brief request. |
| Plan completion (TOD/JIT) on home | `PlanFeedbackModal` → `FeedbackCapture` | `submitPlanFeedback` → `content-feedback` → `content_relevance_feedback` (trigger_context=`post_plan_completion`) | Component already migrated. Map 👍=5 / ⚌=3 / 👎=1 used for legacy analytics. **No rows yet under this trigger** — needs a real plan completion to verify. |
| Per-priority slot feedback (Today's 3) | `PlanFeedbackModal` (already uses `FeedbackCapture`) | same as above | Live. |
| Reset Studio practices (micro / guided / soundscape) | `PracticeRatingModal` (still **5-star UI**) | `submitPracticeRating` → `practice_sessions.effectiveness_rating` (int 1-5) + `content_relevance_feedback` (trigger_context=`post_practice_completion`) | DB writes confirmed: 5 recent rows in `content_relevance_feedback` from real users. **Star UI must be replaced.** |
| Coach/dialogue session feedback | `SessionFeedback` (custom 6-icon resonance grid) | `session_feedback` table | Out of scope — different intent (resonance, not rating). Leaving as-is per memory `feedback-capture-pattern` (it's a separate signal). |

**End-to-end status**: writes work everywhere they're wired. Two gaps to close:
1. `PracticeRatingModal` still ships 5-star UI — must swap to `FeedbackCapture`.
2. Plan-feedback path is wired but unverified in production data; today's change does not touch the write path so it stays correct.

### B. Replace `PracticeRatingModal` with `FeedbackCapture` for all `/reset` practices

Three players invoke `PracticeRatingModal` and all keep its current rating-int contract:
- `src/pages/MicroPracticePlayer.tsx`
- `src/pages/MicroPracticePlayerCards.tsx`
- `src/pages/GuidedPracticePlayer.tsx`
- `src/pages/SoundscapePlayer.tsx`

I will rewrite `PracticeRatingModal.tsx` to render a glass-card shell + `<FeedbackCapture />` internally, preserving its existing props (`onSubmit(rating: number, feedback?)`) so all four player files remain untouched. Internally:
- 👍 → 5, ⚌ → 3, 👎 → 1 (same mapping as `PlanFeedbackModal`)
- This keeps `practice_sessions.effectiveness_rating` and `content_relevance_feedback.star_rating` populating correctly with no migration.

The 2-second confirmation overlay stays.

### C. Glass-card styling (matches micro-practice cards)

Apply the exact glass treatment used in `MicroPracticePlayerCards.tsx` line 2194:
- Modal backdrop: `bg-black/40 backdrop-blur-sm`
- Card: `rounded-3xl p-6 md:p-8 bg-white/15 backdrop-blur-md border border-white/40 shadow-xl`
- Text on glass: `text-white` for headings, `text-white/70` for body, `text-white/50` for hints
- Textarea: `bg-white/10 border-white/20 text-white placeholder:text-white/40`

Applied to **both** `PracticeRatingModal` and `PlanFeedbackModal` so all completion feedback surfaces share one visual language.

### D. Taupe color for the three icons (replace gold)

`FeedbackCapture` currently uses gold (which CSS maps to taupe anyway, but explicit is better). Update the `isActive` and hover treatments to taupe tokens that already exist in the system:

```
isActive: border-taupe bg-taupe/15 text-taupe-foreground
          shadow-[0_0_0_3px_hsl(var(--taupe)/0.20)]
inactive: border-white/30 bg-white/10 text-white/60
          hover:text-white hover:border-white/50
```

Submit button: `bg-taupe hover:bg-taupe-rich text-taupe-foreground` (replaces the gold class).

This change happens once in `FeedbackCapture.tsx` and propagates everywhere — `PlanFeedbackModal`, `PracticeRatingModal`, and the future brief-rating UI.

### E. Files touched

- `src/components/feedback/FeedbackCapture.tsx` — taupe icon palette + submit button; add optional `variant: 'glass' | 'default'` so it can render light text on dark glass
- `src/components/PracticeRatingModal.tsx` — full rewrite: glass shell + `<FeedbackCapture variant="glass" />`; preserve `onSubmit(rating:number, feedback?)` contract; keep auto-skip + confirmation overlay
- `src/components/home/PlanFeedbackModal.tsx` — swap modal shell to glass variant; pass `variant="glass"` to `FeedbackCapture`

No DB migrations. No edge function changes. No changes to the four player pages, `TodayThreePriorities`, or `ExecutiveHome`.

### F. Verification after build

- Run a guided practice → rating modal renders with glass card + 3 taupe icons + textarea
- Submit 👍 → check `practice_sessions.effectiveness_rating = 5` and a new row in `content_relevance_feedback` with `feedback_type='star_rating'`, `star_rating=5`, `trigger_context='post_practice_completion'`
- Submit 👎 with text → `star_rating=1`, `feedback_text` populated
- Skip → no DB write, modal closes
- Complete a TOD plan → `PlanFeedbackModal` renders in same glass style → row in `content_relevance_feedback` with `trigger_context='post_plan_completion'`
- Confirm no star UI remains anywhere (`grep -r "Star" src/components` should only show non-rating uses)

