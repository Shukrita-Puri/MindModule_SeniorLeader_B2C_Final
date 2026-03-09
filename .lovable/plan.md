

## Full Audit: `/coach` Feature (Inner Mastery Coach)

### 1. CRITICAL BUG FINDINGS

#### 🔴 **CRITICAL: Layout Regression After First Message**
The coach interface switches from `CoachConversationCard` (floating card) to `CoachSplitView` (full-screen chat) after the first message, but `CoachSplitView` is rendering messages in the **bottom 20% only** due to flex layout misconfiguration. The conversation area should fill the entire vertical space.

**Root cause**: In `CoachSplitView.tsx`, the message list container lacks `flex-1` to consume available space, pushing content to the bottom.

#### 🔴 **CRITICAL: `physiological_events` RLS Policy Mismatch**
The new `physiological_events` table uses `auth.uid()::text = user_id` for RLS, but **Auth0 users cannot satisfy this** because `auth.uid()` returns `null`. This blocks all reads for production users.

**Impact**: The historical physiological tracking feature (HRV/calendar correlation) will fail for Auth0 users.

#### ⚠️ **HIGH: Unsafe Pattern Analysis Call in `MicroInterventions.tsx`**
Line 147 calls `analyzeEventPhysiologicalPattern()` synchronously, but this function was just refactored to be **async** (calls edge function). This will either fail silently or return a Promise object instead of a string.

---

### 2. DATA FLOW AUDIT (Upstream Inputs)

✅ **Correctly Integrated Upstream Sources**:
- **Calendar events** → `calendar_events` table → Queried by `dialogue-engine` EF for context
- **Check-in outcomes** → `daily_checkins` table → Emotion/energy state passed to coach
- **Wearable data** → Now routed through `user-events` EF → `physiological_events` table (but blocked by RLS)
- **Practice completions** → `practice_sessions`, `sanctuary_events` → Used for accountability tracking
- **Coach memory** → `coach_memories` table → Retrieved via semantic search in `dialogue-engine`
- **Pending commitments** → `coach_accountability_tracker` → Injected into coach context
- **Active scenarios** → `coach_scenarios` table → Matched against event types for JIT scoring

✅ **Edge Functions Handling Coach Logic**:
1. `dialogue-engine` → Main coach conversation (streaming)
2. `dialogue-data-persist` → Saves messages (user + assistant)
3. `dialogue-session-manage` → Creates/ends sessions
4. `detect-coach-scenarios` → Classifies sessions into 24 executive scenarios
5. `extract-tool-commitments` → Detects commitments from transcripts
6. `resolve-session-commitments` → Auto-updates commitment status
7. `analyze-probing-effectiveness` → Scores coach question quality

---

### 3. DOWNSTREAM CLIENT INTEGRATION AUDIT

✅ **Correctly Writing to Downstream Systems**:
- **Mastery Plan** → Coach commitments boost JIT scores (+12 for tool match, +15 for scenario match)
- **Outer Readiness Brief** → Active strengths/growth areas pulled from `coach_session_summaries`
- **Mind Map (Theme Map)** → Topics/themes from `coach_pattern_observations`
- **Recent Activity Sidebar** → Session summaries from `dialogue_sessions` table
- **Tiny Wins Extraction** → `store_tiny_win` tool call → `tiny_wins` table

✅ **All Coach Data Written via Service Role (Secure)**:
- `dialogue_messages`, `dialogue_sessions`, `coach_memories`, `coach_accountability_tracker`, `coach_scenarios`, `coach_probing_effectiveness`, `coach_breakthrough_moments`, `coach_session_summaries`, `coach_pattern_observations`

---

### 4. SECURITY AUDIT (Client vs Server Data)

#### ✅ **SERVER-SIDE (Secure)**
| Data | Storage | Access |
|---|---|---|
| **Coach messages** | `dialogue_messages` | Service role only (RLS deny-by-default) |
| **Coach sessions** | `dialogue_sessions` | Service role only |
| **Memory/facts** | `coach_memories` | Service role only |
| **Commitments** | `coach_accountability_tracker` | Service role only |
| **Scenarios** | `coach_scenarios` | Service role only |
| **Patterns** | `coach_pattern_observations` | Service role only |
| **Probing effectiveness** | `coach_probing_effectiveness` | Service role only |
| **System prompts** | Edge Functions only | Never exposed to client |
| **Scoring algorithms** | Edge Functions only | Never exposed to client |

#### ⚠️ **CLIENT-SIDE (Non-Sensitive)**
| Key | Purpose | Sensitive? |
|---|---|---|
| `coach-{sessionId}` (sessionStorage) | Cached message transcript for UI rendering | ❌ Low — display-ready data user already sees |
| `activeCoachSessionId` (localStorage) | Current session ID for navigation | ❌ No — just a UUID reference |

**Verdict**: ✅ **All proprietary logic and sensitive data is server-side.** Client stores only display-ready transcripts in sessionStorage (ephemeral).

---

### 5. AUTH AUDIT (DEV_MODE vs Auth0)

#### ✅ **Auth0 Path (Production)**
- All edge functions use `verifyAuthToken()` → Extracts `userId` from JWT
- Coach messages scoped by session → Sessions scoped by `user_id`
- Session-scoped retrieval pattern prevents cross-user leakage
- `dialogue-data-persist` uses service role to write messages (bypasses RLS)

#### ✅ **DEV_MODE Path**
- Client hooks use `token || anonKey` pattern (e.g., `useCoachConversation.ts`)
- Edge functions check `x-dev-user-id` header when JWT verification fails
- Mock user `dev-user-123` has dedicated RLS policies for testing

#### 🔴 **REGRESSION: New `physiological_events` Table**
- RLS policy uses `auth.uid()` which is **null for Auth0 users**
- Should use text-based user_id comparison like other tables
- Currently blocks all production reads

---

### 6. DESIGN AUDIT (UI Layout Issue)

#### 🔴 **Problem**: After First Message, Coach Appears in Bottom 20%

**Current Behavior**:
- Empty state → `CoachConversationCard` (centered floating card) ✅ Correct
- After first message → Switches to `CoachSplitView` (full-screen chat) ❌ Messages pushed to bottom

**Root Cause** (in `CoachSplitView.tsx` — Active Conversation section):
```tsx
<div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
  {messages.map(...)}
</div>
```

The `flex-1` class is applied, but the **parent container** (`<div className="relative z-10 flex flex-col h-full">`) doesn't have proper flex distribution. The messages are rendering at natural height instead of filling available space.

**Expected Behavior**:
- Full-height scrollable chat area
- Messages scroll from top to bottom (not pushed to bottom)
- Input bar fixed at bottom

---

### 7. IMPLEMENTATION PLAN

#### A. Fix Layout Regression (High Priority)
**File**: `src/components/coach/CoachSplitView.tsx`

1. Ensure message container fills vertical space correctly
2. Add `justify-start` to parent flex container to anchor messages at top
3. Test with 1, 3, 5, 10+ messages to ensure scrolling works correctly

#### B. Fix `physiological_events` RLS Policy (Critical Security)
**File**: `supabase/migrations/[latest]_fix_physiological_events_rls.sql`

Replace:
```sql
USING (auth.uid()::text = user_id);
```

With:
```sql
USING (user_id = (SELECT id FROM profiles WHERE id = auth.jwt()->>'sub' LIMIT 1));
```

Or use the Auth0-compatible pattern from other tables:
```sql
-- Service role manages all access
-- Client reads via edge functions only
```

#### C. Fix Async Pattern Analysis Call (High Priority)
**File**: `src/components/home/MicroInterventions.tsx` (Line 147)

Option 1: Remove pattern analysis from sync detection loop (use static reasoning)
Option 2: Refactor detection to be async and await the pattern analysis

#### D. Optional: Consolidate Layout Components
The coach uses two separate components (`CoachConversationCard`, `CoachSplitView`) for empty vs active states. This creates layout shift. Consider:
- Single component with conditional rendering
- Or ensure both use identical container dimensions

---

### 8. SUMMARY SCORECARD

| Aspect | Status | Notes |
|---|---|---|
| **Upstream data flow** | ✅ Pass | Calendar, check-ins, wearables, commitments all integrated |
| **Downstream integration** | ✅ Pass | Feeds Mastery Plan, Outer Readiness, Mind Map correctly |
| **Security** | ✅ Pass | All sensitive data server-side, RLS enforced |
| **Auth0 compatibility** | ⚠️ Partial | Main coach works, but new `physiological_events` blocked |
| **DEV_MODE compatibility** | ✅ Pass | `x-dev-user-id` fallback working |
| **UI Layout** | 🔴 Fail | Messages pushed to bottom 20% after first response |
| **Async safety** | ⚠️ Partial | Pattern analysis call needs refactor |

---

### FILES TO MODIFY

1. `src/components/coach/CoachSplitView.tsx` — Fix message container flex layout
2. `supabase/migrations/[new]_fix_physiological_events_rls.sql` — Update RLS policy for Auth0
3. `src/components/home/MicroInterventions.tsx` — Fix async pattern analysis call

