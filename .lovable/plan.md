

# Plan: Outer Readiness Brief — Coach Insights Tiered Recency + Priority Cascade

## Current State
- `getLeanOnWatchFor()` in `compute-outer-readiness/index.ts` has a basic coach insights priority (P1) with a simple >3 day contradiction check, but:
  - No age tiers (recent/grace/contextual/historical/archived)
  - No age labels returned to the client
  - Hard cutoff: coach insights query only fetches last 7 days of check-ins, but coach insights themselves have no recency gate — they're used if active, regardless of age
  - No contextual enrichment for older insights (8-14 days)
  - No wearable recovery override (P-1, feature-flagged)
  - Response type doesn't include `coachInsightAge` or `coachInsightLabel`
- `StrategicIntentionCard.tsx` has no rendering for age labels or contextual enrichment
- `user_coach_insights` table uses `insight_type` + `insight_content` (not `strength_area`/`growth_area` columns as the user's spec assumed)
- Table currently has no data — but architecture must be ready

## Schema Note
- `daily_themes` table does NOT need new columns — `coachInsightAge`/`coachInsightLabel` are transient display data, not persisted
- No DB migration required

## Changes (2 files)

### 1. `supabase/functions/compute-outer-readiness/index.ts`

**Add coach insight age tier logic:**
- After fetching coach insights (lines 744-776), compute `daysOld` from `coachInsightCreatedAt`
- Assign tier: `≤3 → recent`, `4-7 → grace`, `8-14 → contextual`, `15-30 → historical`, `>30 → archived`

**Rewrite `getLeanOnWatchFor()` to implement full priority cascade:**
- P-1: Wearable recovery override (feature-flagged off, stub only)
- P0: Sunday evening override (already exists, keep)
- P1a: Coach insights ≤3 days — use directly, no age label
- P1b: Coach insights 4-7 days — use if no C×C contradiction, add age label
- P2: C×C modifier — with contextual enrichment if 8-14 day coach insights exist (append italic text to leanOn)
- P3: Evening recovery override (already exists, keep)
- P4: Archetype × tier (already exists, keep)
- P5: Tier fallback (already exists, keep)
- Historical (15-30 days) and archived (>30 days) coach insights: NOT used on homepage

**Update response type** to include optional `coachInsightAge` (number) and `coachInsightLabel` (string)

**Update `buildDataSources()`** to include 'coach insights' when coach data is used

### 2. `src/hooks/useOuterReadiness.ts` + `src/components/home/StrategicIntentionCard.tsx`

**`useOuterReadiness.ts`**: Add `coachInsightAge?` and `coachInsightLabel?` to `OuterReadinessData` interface

**`StrategicIntentionCard.tsx`**: 
- Render coach insight age label when `brief.coachInsightLabel` exists — styled as a subtle info bar with saffron left border
- Parse leanOn text for contextual enrichment (text after `\n\n_` rendered as italic block with top border separator)

## Priority Cascade Summary
```text
P-1  Wearable recovery (feature-flagged OFF)
P0   Sunday evening (≥21:00 Sunday)
P1a  Coach ≤3 days (no label)
P1b  Coach 4-7 days, no C×C contradiction (age label)
P2   C×C modifier (+ 8-14 day coach enrichment if available)
P3   Evening recovery (≥21:00 weekdays)
P4   Archetype × tier
P5   Tier fallback
```

## Downstream Impact
- **Mastery Plan** (`generate-mastery-plan`): No change needed — it reads coach insights independently
- **Coach** (`self-mastery-coach`): No change needed — reads insights independently
- **Inner Readiness**: No change needed — feeds INTO outer readiness, not the reverse
- **`daily_themes` persistence**: No schema change — `coachInsightAge`/`coachInsightLabel` are transient response fields only
- **`state-patterns-insights`**: Excluded per user request (no Insights page changes)

