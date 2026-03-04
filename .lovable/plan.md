

## Plan: Proactive Mastery Plan v3.0 — Incremental Updates

This plan covers three categories: (A) fix three identified bugs, (B) create new DB tables and schema changes, (C) create new edge functions, (D) update documentation.

---

### A. Bug Fixes

#### A1. Fix dead `effectiveContent` signal (+20 scoring)

**File: `src/components/home/DailyRitual.tsx`** (line ~340)

Replace `effectiveContent: []` with a query to `content_relevance_feedback` for practices the user rated 4-5 stars. Add a query before the request body construction:

```typescript
// Fetch effective content IDs (practices rated 4-5 stars)
const { data: effectiveFeedback } = await supabase
  .from('content_relevance_feedback')
  .select('content_id')
  .eq('user_id', user.id)
  .gte('star_rating', 4);

const effectiveContentIds = effectiveFeedback?.map(f => f.content_id) || [];
```

Then pass `effectiveContent: effectiveContentIds` in the request body. No edge function changes needed — the EF already scores this signal at +20.

#### A2. Race condition in `updateRitualCompletion` (4 sequential calls → 1 atomic call)

**File: `supabase/functions/daily-rituals/index.ts`**

Add a new action `COMPLETE_PRACTICE` that atomically appends to `completed_practice_ids` and recalculates status server-side in a single operation:

```typescript
case 'COMPLETE_PRACTICE': {
  const { practiceType, practiceId } = body;
  // 1. Get current ritual
  // 2. Append practiceId if not already present
  // 3. Set boolean flag + timestamp for practiceType
  // 4. Recalculate completion_status
  // 5. Upsert in ONE call
  // Return updated ritual
}
```

**File: `src/utils/dailyRituals.ts`**

Refactor `updateRitualCompletion()` to call the single `COMPLETE_PRACTICE` action instead of doing GET → UPSERT → GET → UPSERT (4 calls → 1 call). Both DEV_MODE and production paths updated.

#### A3. `user_coach_insights` type safety

The table IS already in `types.ts` (confirmed at line 2867). No action needed — this issue was a false positive from the audit. Will update documentation to mark as resolved.

---

### B. Database Schema Changes (Migration)

#### B1. Add missing columns to `jit_preferences`

```sql
ALTER TABLE jit_preferences
  ADD COLUMN IF NOT EXISTS skipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS event_start_time timestamptz,
  ADD COLUMN IF NOT EXISTS minutes_before_event integer;
```

#### B2. Create `coach_scenarios_detected` table (new — does not exist)

```sql
CREATE TABLE public.coach_scenarios_detected (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  scenario text NOT NULL,
  dimension text,
  event_types text[],
  detected_at timestamptz DEFAULT now(),
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.coach_scenarios_detected ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage coach_scenarios_detected"
  ON public.coach_scenarios_detected FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX idx_scenarios_event_types 
  ON public.coach_scenarios_detected USING gin(event_types);
CREATE INDEX idx_scenarios_user 
  ON public.coach_scenarios_detected(user_id);
```

#### B3. Create `jit_event_context` table

Full schema as specified in the architecture doc. RLS: service_role only.

#### B4. Create `jit_carousel_cards` table

Full schema as specified. RLS: service_role only.

#### B5. Create `jit_pill_display_log` table

Full schema as specified. RLS: service_role only.

#### B6. Create `get_event_type_skip_count` DB function

```sql
CREATE OR REPLACE FUNCTION public.get_event_type_skip_count(
  p_user_id text, p_event_type text, p_days_back integer
) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM jit_preferences
  WHERE user_id = p_user_id
    AND event_type = p_event_type
    AND created_at >= (now() - (p_days_back || ' days')::interval);
$$;
```

---

### C. New Edge Functions

#### C1. `generate-jit-events` (NEW)

**Path:** `supabase/functions/generate-jit-events/index.ts`

Full JIT event detection and scoring pipeline as specified:
- Accepts `userId`, `timezoneOffset`
- Queries `calendar_events` (next 48h), `jit_preferences` (skip history), `coach_scenarios_detected`, `dialogue_messages` (user mentions), `user_coach_insights` (goals)
- Implements 5-factor scoring + coach context boost + skip penalty
- Generates pill labels and context statements
- Stores scored events in `jit_event_context`
- Returns top 2 events + time-of-day pill

Config: `verify_jwt = false` in `supabase/config.toml`

#### C2. `generate-jit-carousel` (NEW)

**Path:** `supabase/functions/generate-jit-carousel/index.ts`

Carousel card generation for a specific JIT event:
- Accepts `userId`, `eventId`
- Reads `jit_event_context` for event details
- Selects practices from `sanctuary_content` + `sanctuary_content_metadata` based on scenario modules
- Determines coach card position (first if pending tool / expressed concern / score >= 90, else last)
- Stores cards in `jit_carousel_cards`
- Returns ordered card array

Config: `verify_jwt = false`

#### C3. `track-jit-skip` (NEW)

**Path:** `supabase/functions/track-jit-skip/index.ts`

Simple skip/dismiss logger:
- Accepts `userId`, `eventId`, `eventType`, `eventTitle`, `action`
- Updates `jit_event_context.dismissed_by_user = true`
- Inserts into `jit_preferences` with skip details
- Returns success

Config: `verify_jwt = false`

---

### D. Documentation Update

**File:** `.lovable/proactive-mastery-plan-documentation.md`

Update the existing doc to v3.0:
- Add JIT Coach Integration section (coach context boost scoring, context statement generation, pill label generation)
- Add new tables (coach_scenarios_detected, jit_event_context, jit_carousel_cards, jit_pill_display_log)
- Add new edge functions (generate-jit-events, generate-jit-carousel, track-jit-skip)
- Mark `effectiveContent` gap as RESOLVED
- Mark `user_coach_insights` type safety as RESOLVED (was false positive)
- Mark race condition as RESOLVED
- Update tooltip text
- Add executive scenario → event type mapping table
- Add coach prompts by context table
- Add future features section (role play, mental models)

---

### Implementation Order

1. Database migration (all tables + function + jit_preferences columns)
2. Fix `daily-rituals` EF with `COMPLETE_PRACTICE` action
3. Fix `updateRitualCompletion` client-side to use single call
4. Fix `effectiveContent` in `DailyRitual.tsx`
5. Create `generate-jit-events` edge function
6. Create `generate-jit-carousel` edge function
7. Create `track-jit-skip` edge function
8. Update `supabase/config.toml` with new function entries
9. Update documentation

### What is NOT changed
- No UI/design changes
- No changes to `generate-mastery-plan` EF (existing scoring logic stays)
- No changes to `types.ts` or `client.ts` (auto-generated)
- No changes to player pages or coach page layout

