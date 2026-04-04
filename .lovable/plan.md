

# Phase 4 Implementation + Coach Mobile Label + Insights Intelligence

## Overview
Three deliverables: (1) Coach Homepage Voice via surface messages in the Compass card, (2) mobile-friendly coach button label replacing tooltip, (3) feeding Insights page data into the coach's context.

---

## 1. Coach Homepage Voice (Phase 4 — Gap 6)

### 1A: Update `generate-coach-summary/index.ts`
After the existing downstream feed block (line ~235), add a new guarded block (`ENABLE_COACH_SURFACE`):
- Query `calendar_events` for next 24hrs for this user
- Query `coach_accountability_tracker` for pending commitments
- Keyword-match commitments against upcoming event titles
- If match found, check if a surface message already exists today (not dismissed)
- If no existing message: call LLM (gemini-2.5-flash) with a tight prompt: "Generate a 15-word max coach voice message connecting [commitment] to [event]. Voice: direct, C-suite, no fluff."
- Insert into `coach_surface_messages` with `expires_at = now() + 8 hours`
- Max 1 per session. Suppress if one exists for today.

### 1B: New component `src/components/coach/CoachSurfaceMessage.tsx`
- Fetches from `coach_surface_messages` via edge function or direct Supabase query (service uses Auth0 token pattern — use `getAuthToken()` + supabase client with RLS)
- Query: `select * from coach_surface_messages where dismissed = false and expires_at > now() order by created_at desc limit 1`
- Renders nothing if empty
- When present: subtle italic line with coach attribution, small dismiss (×) button
- Dismiss updates `dismissed = true` via supabase update
- Style: `text-[12px] italic text-muted-foreground/80` with a small `ChatCircle` icon prefix

### 1C: Mount in `StrategicIntentionCard.tsx`
- Import `CoachSurfaceMessage`
- Place between the coach insight label section (line ~94) and the Lean On section (line ~97)
- Zero visual impact when no message exists

### Feature flag
`ENABLE_COACH_SURFACE` — Deno env var in edge function. Client component always renders but returns null if no data.

---

## 2. Mobile Coach Button Label

### Problem
`CoachAccessButton` uses a `Tooltip` which doesn't trigger on mobile (no hover). Users don't know the button is the Mind Performance Coach.

### Fix in `CoachAccessButton.tsx`
- Keep the tooltip for desktop
- Add a persistent small label below or beside the icon button on mobile
- Use a subtle text label: `<span className="text-[9px] text-white/60 font-body hidden max-[640px]:block">Coach</span>` or similar
- Alternatively: make the button slightly wider on mobile with inline text "Coach" visible
- Future-proof: accept an optional `observation` or `surfaceHint` prop that can display dynamic state-based text (e.g., "Readiness dropped 20%") — render below the button as a small badge/label when provided

### Implementation
- Wrap button + label in a flex column container
- On mobile (< 640px): show "Mind Coach" text below icon
- On desktop: keep tooltip behavior as-is
- Add optional `surfaceHint?: string` prop for future dynamic prompts

---

## 3. Insights Data → Coach Intelligence

### Problem
The coach has no awareness of the user's Insights page patterns — semantic themes, performance rhythm, leadership patterns, practice effectiveness trends. This data is computed by `insights-semantic-analysis`, `performance-rhythm-insights`, and `state-patterns-insights` edge functions but never fed to the coach.

### Implementation in `self-mastery-coach/index.ts`

Add 2 new queries to the existing `Promise.all` in `buildServerContext()`:

**Query A — Semantic Themes** (from `insights-semantic-analysis` output, stored as coach session topics):
```sql
SELECT key_topics, dominant_pattern, recurring_themes
FROM coach_session_summaries
WHERE user_id = ? AND created_at > now() - interval '30 days'
ORDER BY created_at DESC LIMIT 10
```
Already partially fetched (query #20 gets `dominant_pattern`). Extend to aggregate `recurring_themes` across sessions → build `topRecurringThemes: string[]`.

**Query B — Energy/State Rhythm Patterns**:
```sql
SELECT outcome, time_window, checkin_date
FROM daily_checkins
WHERE user_id = ? AND checkin_date > now() - interval '14 days'
ORDER BY checkin_date DESC
```
Compute: best/worst time windows, state trajectory (improving/declining/stable over 14 days).

### Add to `CoachContext` interface:
```typescript
insightsIntelligence?: {
  topRecurringThemes: string[];
  stateTrajectory: 'improving' | 'declining' | 'stable';
  bestTimeWindow: string | null;
  worstTimeWindow: string | null;
  dominantPatternLast30Days: string | null;
};
```

### Prompt injection (feature-flagged `ENABLE_INSIGHTS_INTELLIGENCE`):
```
INSIGHTS INTELLIGENCE:
[If recurring themes]: Themes recurring across sessions: [themes]. These represent persistent patterns worth naming or resolving.
[If trajectory declining]: User's state has been declining over 14 days. Approach with care — this may need acknowledgment before challenge.
[If trajectory improving]: User's state is trending upward. Reinforce what's working.
[If best/worst windows]: User tends to be strongest in [window] and most challenged in [window]. Use this for timing recommendations.
```

### Data source
This reuses existing tables (`coach_session_summaries`, `daily_checkins`) — no new migrations needed. The coach already fetches some of this data but doesn't synthesize it into actionable intelligence for the prompt.

---

## Files Changed Summary

| Change | Files | Type |
|--------|-------|------|
| Surface messages | `generate-coach-summary/index.ts`, `CoachSurfaceMessage.tsx` (new), `StrategicIntentionCard.tsx` | Edge + Client |
| Mobile label | `CoachAccessButton.tsx` | Client |
| Insights intelligence | `self-mastery-coach/index.ts` | Edge function |

## What Will NOT Be Touched
- Existing coach prompt structure or response modes
- Database schema (no new migrations — `coach_surface_messages` table already exists from Phase 3 migration)
- Navigation logic
- Insights page components
- Authentication or RLS policies

