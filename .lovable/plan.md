

# Outer Readiness Brief — Full Audit Report

## 1. Copy Generation: What is AI-generated vs Deterministic?

**Everything is 100% deterministic.** No AI/LLM calls are made anywhere in the Outer Readiness Brief pipeline.

| Copy Element | Source | Method |
|---|---|---|
| **Phrase** (e.g. "Hold your ground.") | `getTheme()` — lines 61-187 | Deterministic matrix: tier x pressure x load x time x day |
| **Context** (paragraph below phrase) | `getTheme()` — same function | Same deterministic matrix (~40 themes) |
| **Lean On** | `getLeanOnWatchFor()` — lines 373-444 | 4-tier priority cascade (see below) |
| **Watch For** | `getLeanOnWatchFor()` — same function | Same cascade |
| **Pattern Override** (replaces context) | `getPatternOverride()` — lines 447-475 | Deterministic: triggers after 3+ consecutive low-state days |
| **"Strength without clarity" override** | Lines 567-570 | Deterministic: strong/peak tier + avg C+C ≤ 2.0 |

### Lean On / Watch For Priority Cascade

The edge function resolves Lean On and Watch For through this priority order:

1. **Coach Insights** (Priority 1) — from `user_coach_insights` table (active strength/growth_area records). These are AI-generated during coach sessions but are pre-stored, not generated at brief time.
2. **C+C Signal Modifier** (Priority 2) — deterministic based on avg clarity+confidence thresholds (≤2.5 or ≥4.5). Uses the OLD averaging logic, not the new independent-signal approach from the Inner Readiness Layer 2 rewrite.
3. **Archetype x Tier** (Priority 3) — deterministic matrix: 5 archetypes x 4 tiers = 20 combinations.
4. **Tier Fallback** (Priority 4) — 4 hardcoded tier-only fallbacks.
5. **Late Evening Override** — after 9 PM, uses recovery-oriented insights per tier, with Sunday-specific variants. Low C+C can still override evening defaults.

### Data Inputs Used

The edge function receives and uses:
- `innerReadinessTier` and `innerReadinessScore` (from energy state engine)
- `calendarLoad` and `calendarPressure` (from calendar events)
- `archetype` (from profiles table)
- `clarityLevel` and `confidenceLevel` (from today's check-in)
- `checkInOutcome` (from energy state)
- `timezoneOffset` (from client)
- Coach insights (fetched server-side from `user_coach_insights`)
- Recent check-in history (fetched server-side from `daily_checkins`, last 7 days)

**All relevant data inputs are being consumed.** The copy is genuinely built from the triangulation of inner readiness, calendar demands, archetype, coach insights, and temporal context.

---

## 2. DB Read/Write Status

### Writing (confirmed working)
The edge function upserts to `daily_themes` (line 583) on every call with: `theme_phrase`, `theme_driver`, `check_in_outcome`, `calendar_pressure`, `calendar_load`, `time_of_day`, `lean_on`, `watch_for`, `inner_readiness_score`, `archetype`. The upsert uses `onConflict: 'user_id,theme_date'` so it updates on re-check-in.

### Reading (confirmed working)
The function reads from:
- `user_coach_insights` (strength/growth_area, active, last 5)
- `daily_checkins` (last 7 days for pattern detection)

Network logs confirm HTTP 200 responses with valid data.

### Downstream Consumers
3 downstream features read from `daily_themes`:
1. **Insights Semantic Analysis** (`insights-semantic-analysis/index.ts`) — reads `theme_phrase`, `theme_driver`
2. **State Patterns Insights** (`state-patterns-insights/index.ts`) — reads `theme_phrase`, `theme_driver`
3. **Leadership Patterns Card** (`LeadershipPatternsCard.tsx`) — reads `theme_phrase`, `theme_driver`

All are working and tracking correctly.

---

## 3. Issues Found

### Issue A: Lean On / Watch For text too small on mobile (UI Bug)
Currently `text-xs text-primary/70` and `text-xs text-muted-foreground/70` — at `text-xs` (12px) with 70% opacity, this is borderline illegible on mobile. The phrase and context are well-sized but the Lean On/Watch For section gets lost.

**Fix:** Bump to `text-sm` (14px) and increase opacity to `/80` or `/90`. Add `leading-relaxed` for line spacing.

### Issue B: Lean On/Watch For C+C logic still uses OLD averaging (Inconsistency)
The `getCCModifier()` in the Outer Readiness edge function (line 278) still uses `(c + conf) / 2` averaging with thresholds ≤2.5 and ≥4.5. This contradicts the Layer 2 rewrite in `compute-inner-readiness` which now evaluates Clarity and Confidence independently.

This means: Inner Readiness says "Low clarity with high confidence" (independent) but Outer Readiness Lean On/Watch For may not trigger at all because the average is mid-range.

**Fix:** Rewrite `getCCModifier()` in `compute-outer-readiness` to use independent signal evaluation matching the Inner Readiness Layer 2 approach.

### Issue C: No critical bugs
Edge function logs show clean shutdowns, no errors. Network requests return 200. DB persistence is confirmed working.

---

## Implementation Plan

### Change 1: Fix Lean On / Watch For font size in `StrategicIntentionCard.tsx`
- Line 57: `text-xs` → `text-[13px]` and `text-primary/70` → `text-primary/80`, add `leading-relaxed`
- Line 61: `text-xs` → `text-[13px]` and `text-muted-foreground/70` → `text-muted-foreground/80`, add `leading-relaxed`

### Change 2: Align Outer Readiness C+C logic with Inner Readiness independent signals
Rewrite `getCCModifier()` in `compute-outer-readiness/index.ts` (lines 278-304) to evaluate Clarity and Confidence independently, using similar pattern logic to the Inner Readiness Layer 2 but producing Lean On/Watch For pairs instead of context statements.

