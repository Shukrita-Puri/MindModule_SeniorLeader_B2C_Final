

## Insights Feature — Full Audit Results

### CRITICAL BUGS

#### BUG 1: `performance-rhythm-insights` EF — Unscoped `dialogue_messages` Query (CRITICAL / Security)

**File:** `supabase/functions/performance-rhythm-insights/index.ts` line 97-98
**Issue:** The EF queries `dialogue_messages` with `.limit(300)` but **no user_id filter and no session_id filter**. This means the Presence section reads messages from ALL users in the system. The same bug exists in the DEV_MODE path of `PerformanceRhythmCard.tsx` (line 124-127).

```typescript
// EF line 97 — reads ALL dialogue_messages globally
sb.from("dialogue_messages").select("content, sender_type, session_id").limit(300)
```

**Fix:** First fetch `dialogue_sessions` for this user, then query messages scoped to those session IDs:
```typescript
const { data: userSessions } = await sb
  .from("dialogue_sessions").select("id")
  .eq("user_id", userId).gte("created_at", thirtyDaysAgoIso);
const sessionIds = (userSessions || []).map(s => s.id);
const dialogueRes = sessionIds.length > 0
  ? await sb.from("dialogue_messages").select("content, sender_type, session_id")
      .in("session_id", sessionIds)
  : { data: [] };
```

**Impact:** Presence score, coach session count, and presence insight text are all contaminated with other users' data.

---

#### BUG 2: `tinyWinsContent` Never Populated in Auth Path (HIGH)

**File:** `src/pages/Insights.tsx` lines 378-391
**Issue:** In production (non-DEV_MODE), `fetchTinyWinsInsights` calls the EF and sets `tinyWinsInsights` from `data.data`, but **never calls `setTinyWinsContent()`**. The `tinyWinsContent` array stays empty. This means:
- The "recent win texts" fallback (line 803-812) never renders
- The `relatedWins` prop passed to `PsychologicalDimensionBubbles` (line 785) is always empty

**Fix:** Either (a) have the EF return `winsContent` array and set it client-side, or (b) make a separate DB query for win content text in the auth path.

---

#### BUG 3: `state-patterns-insights` EF Returns `data.data` but Client Expects Different Shapes (MEDIUM)

**File:** `src/pages/Insights.tsx` line 436-437 vs `src/components/insights/LeadershipPatternsCard.tsx` line 216-217
**Issue:** `Insights.tsx` fetches from `state-patterns-insights` and stores `data.data` in `statePatterns` (a `StatePatternInsights` type with `distribution`, `observation`, `checkInCount`). But the EF actually returns a `LeadershipPatternsData` shape with fields like `aiObservation`, `frictionPct`, etc. — no `distribution` field.

**Result:** In Auth path, `statePatterns.distribution` is undefined, and `statePatterns.observation` maps to nothing (EF returns `aiObservation`). The `checkInCount` does work because the EF returns it. But the state distribution used on the Insights page (if rendered anywhere) would be broken.

**Severity:** Medium — currently `checkInCount` is the only field actively consumed from `statePatterns` on the main Insights page. The distribution is not rendered. But it's still a data mismatch.

**Fix:** Either map the EF response to match `StatePatternInsights`, or change the client type to match the EF response.

---

### HIGH-PRIORITY ISSUES

#### BUG 4: `LeadershipPatternsCard` Auth Path — Watch For Fallback Logic Error (HIGH)

**File:** `src/components/insights/LeadershipPatternsCard.tsx` lines 399-409
**Issue:** When `coachFriction` is null AND `coachSessionCount < 3`, it shows "Complete 3 coach sessions to surface personalized observations". But the EF always returns `coachSessionCount` (from `dialogue_sessions`), and the fallback `archetypeWatchFor` is only shown when `coachSessionCount >= 3` AND `coachFriction` is null. This means users with 0-2 coach sessions and no coach friction see a placeholder instead of their archetype's Watch For text.

**Expected behavior:** Always show archetype Watch For as the base, with coach friction replacing it when available.

**Fix:** Change the conditional: show `archetypeWatchFor` when no `coachFriction`, regardless of `coachSessionCount`. Move the "complete 3 sessions" nudge below as a secondary note.

---

#### BUG 5: DEV_MODE `dialogue_messages` Query Unscoped (HIGH)

**File:** `src/components/insights/PerformanceRhythmCard.tsx` line 124-127, `src/pages/Insights.tsx` line 453-458
**Issue:** Both DEV_MODE paths query `dialogue_messages` without filtering by `user_id` or session scope. Same class of bug as BUG 1 but on the client side (less critical since DEV_MODE is false).

**Fix:** Scope queries through `dialogue_sessions` filtered by user_id first.

---

### MEDIUM ISSUES

#### BUG 6: `score_date` Used as Time Window Index but Stores Date Only (MEDIUM)

**File:** `supabase/functions/performance-rhythm-insights/index.ts` lines 133-138
**Issue:** `inner_readiness_scores.score_date` is a date column (no time component). `getTimeWindow(d.getHours())` on a date-only value always returns hour 0 → time window 2 (Evening). All composite scores pile into the Evening row of the heatmap.

**Fix:** Use `time_of_day` column (already selected in the query at line 93) to determine the time window instead of parsing hours from `score_date`.

---

#### BUG 7: `insights-semantic-analysis` EF Uses 7-Day Window for Check-Ins/Wins (MEDIUM)

**File:** `supabase/functions/insights-semantic-analysis/index.ts` line 117
**Issue:** The `days` parameter defaults to 7. This means the Mind Map only analyzes the last 7 days of data, while all other cards use 14-30 days. For users who check in sporadically, the Mind Map may show nothing while other cards have data.

**Fix:** Default `days` to 30 to match other EFs, or at minimum 14.

---

### DB & TABLE VALIDATION

| Card | Tables Read | Status |
|------|------------|--------|
| **Card 1 (Self-Mastery)** EF | `profiles`, `daily_checkins`, `daily_themes`, `user_coach_insights`, `sanctuary_events`, `daily_ritual_completions`, `tiny_wins`, `wearable_data`, `dialogue_sessions`, `dialogue_messages`, `calendar_connections`, `behavior_logs`, `inner_readiness_scores` | All tables exist. RLS correct (service_role). |
| **Card 2 (Momentum)** EF | `tiny_wins` | Table exists. RLS correct. |
| **Card 3 (Rhythm)** EF | `daily_checkins`, `calendar_connections`, `calendar_events`, `behavior_logs`, `inner_readiness_scores`, `daily_ritual_completions`, `dialogue_messages` | All exist. **`dialogue_messages` unscoped — BUG 1.** |
| **Card 4 (Mind Map)** EF | `daily_themes`, `dialogue_sessions`, `dialogue_messages`, `sanctuary_events`, `tiny_wins`, `daily_checkins`, `coach_session_summaries`, `coach_pattern_observations` | All exist. RLS correct. |

### EF CONNECTION VALIDATION

| EF | Called From | Auth | Status |
|----|-----------|------|--------|
| `state-patterns-insights` | `LeadershipPatternsCard.tsx`, `Insights.tsx` | `verifyAuth0JWT` | Working (logs confirm) |
| `tiny-wins-insights` | `Insights.tsx` | `verifyAuth0JWT` | Working |
| `performance-rhythm-insights` | `PerformanceRhythmCard.tsx` | `verifyAuth0JWT` | Working but **BUG 1** |
| `insights-semantic-analysis` | `Insights.tsx` | `verifyAuth0JWT` | Working |

### WORKFLOW ACCURACY

| Card | Flow | Verified |
|------|------|----------|
| Card 1 | User check-in → `daily_checkins` → EF reads 30d → computes scores/archetype/friction/trend → AI observation → returns to client | Correct |
| Card 2 | Coach detects win → `store-tiny-win` → `tiny_wins` → EF reads 14d → extracts dimensions → AI observation → returns to client | Correct but **tinyWinsContent missing in Auth path (BUG 2)** |
| Card 3 | Check-in + calendar + behaviors → EF reads 30d → builds grid + best window + calendar/cause-effect/presence → returns to client | **Dialogue messages unscoped (BUG 1)**, **score_date time window wrong (BUG 6)** |
| Card 4 | Coach conversations + wins + check-ins + practices → EF extracts themes via AI → returns unified themes + relationships → client renders bubbles | Correct but **7-day default too short (BUG 7)** |

---

### IMPLEMENTATION PLAN

| # | Fix | Severity | Files |
|---|-----|----------|-------|
| 1 | **Scope `dialogue_messages` query by user's session IDs** in `performance-rhythm-insights` EF | CRITICAL | `supabase/functions/performance-rhythm-insights/index.ts` |
| 2 | **Populate `tinyWinsContent` in Auth path** — add win content to EF response or fetch separately | HIGH | `supabase/functions/tiny-wins-insights/index.ts`, `src/pages/Insights.tsx` |
| 3 | **Fix Watch For fallback** — always show archetype text when no coach friction | HIGH | `src/components/insights/LeadershipPatternsCard.tsx` |
| 4 | **Fix `score_date` time window** — use `time_of_day` column instead of parsing hours | MEDIUM | `supabase/functions/performance-rhythm-insights/index.ts` |
| 5 | **Increase Mind Map default days** from 7 to 30 | MEDIUM | `supabase/functions/insights-semantic-analysis/index.ts` |
| 6 | **Scope DEV_MODE dialogue queries** (optional cleanup) | LOW | `src/components/insights/PerformanceRhythmCard.tsx`, `src/pages/Insights.tsx` |

**Files changed:** 2 Edge Functions, 2 Client Components.

