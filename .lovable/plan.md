

# /coach Feature — Full Audit & Fix Plan

## Architecture Summary

```text
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT: SelfMasteryCoach.tsx → useCoachConversation.ts         │
│    ↓ sends messages to                                          │
│    ↓ self-mastery-coach (edge fn, streaming)                    │
│    ↓ saves messages via dialogue-data-persist                   │
│    ↓ creates/ends sessions via dialogue-session-manage          │
│                                                                 │
│  ON SESSION END (fire-and-forget):                              │
│    1. extract-coach-insights                                    │
│    2. analyze-probing-effectiveness                             │
│    3. generate-coach-summary                                    │
│    4. detect-recurring-patterns                                 │
│    5. detect-coach-scenarios                                    │
│    6. extract-tool-commitments                                  │
│    7. resolve-session-commitments                               │
│    8. extract-session-memories (chained after summary)          │
└─────────────────────────────────────────────────────────────────┘
```

---

## A. Upstream Data Sources (self-mastery-coach reads from)

The `buildServerContext()` function (lines 1376-1631) runs **13 parallel DB queries**:

| # | Table | Purpose | Status |
|---|-------|---------|--------|
| 1 | `profiles` | Archetype, identity_role, name | ✅ Working |
| 2 | `practice_sessions` | Recent 7-day practices | ✅ Working |
| 3 | `daily_checkins` | State patterns, streaks | ✅ Working |
| 4 | `sanctuary_events` | Practice completion count | ✅ Working |
| 5 | `tiny_wins` | Recent win themes (14 days) | ✅ Working (2 wins in DB) |
| 6 | `coach_session_summaries` | Last session summary | ⚠️ TABLE EMPTY (0 rows) |
| 7 | `coach_accountability_tracker` | Pending commitments | ⚠️ TABLE EMPTY (0 rows) |
| 8 | `coach_pattern_observations` | Patterns to name | ⚠️ TABLE EMPTY (0 rows) |
| 9 | `coach_memory_index` | Session memories | ⚠️ TABLE EMPTY (0 rows) |
| 10 | `coach_probing_effectiveness` | Effective probe types | ⚠️ TABLE EMPTY (0 rows) |
| 11 | `coach_breakthrough_moments` | Past breakthroughs | ⚠️ TABLE EMPTY (0 rows) |
| 12 | `user_coach_insights` | LEAN ON / WATCH FOR | ✅ (separate query) |
| 13 | `calendar_events` | Calendar-state correlations | ✅ Working |

---

## B. Downstream Data Writes (on session end)

**All 8 downstream functions have ZERO logs** — they have NEVER executed in production.

### ROOT CAUSE: BUG — Sessions are never "ended" properly

**Evidence from DB:**
- 58 total sessions, only 2 marked "completed", 56 stuck as "active"
- All 56 "active" sessions have `total_messages: 0` and `ended_at: NULL` — even ones with 12 actual messages
- The `endSession()` function in `useCoachConversation.ts` fires 8 downstream edge functions — but only when the session is properly ended

**Why sessions aren't ending:**
1. User navigates away without clicking "End session" → `endSession()` never fires
2. Even when `endSession()` runs, it checks `messages.length < 2` on line 392. But `messages` is React state — if the component unmounts during navigation, the state may already be cleared
3. The `handleBackNavigation()` on line 365 does call `endSession()`, but there's a race condition: `clearConversation()` inside `endSession()` clears `messages` state, and the `messages.length` dependency in the `endSession` useCallback may see stale data

**Impact:** ALL downstream intelligence (summaries, patterns, commitments, memories, probing analysis, breakthrough detection) is completely non-functional because sessions never reach "completed" status.

---

## C. Coach Role (Final System Prompt)

The self-mastery-coach operates with **6 co-equal roles**:

1. **Guide them to their own solution** (primary emphasis) — Probe before advising, help self-discovery
2. **Organize their thinking** — Separate layers, surface the real question
3. **Spot patterns across sessions** — Name recurring themes using memory
4. **Hold them accountable** — Track commitments, check follow-through
5. **Be the devil's advocate** — Challenge assumptions, stress-test thinking
6. **Offer tools as accountability anchors** — Repeatable practices with built-in follow-up

Core operating principle: **STATE → STORY → STRATEGY** (never reversed).

The coach is NOT: a productivity coach, task manager, strategic advisor, or therapist. Works exclusively in the "inner world" — emotional regulation, mental clarity, nervous system states, thought patterns, self-awareness.

---

## D. Recalibrate / Practices Integration

The system prompt (lines 493-529) explicitly references Recalibrate Studio practices:

- **Somatic Protocols**: Box Breathing, Bhramari Breath, Release Exhale, Somatic Touch Grounding, Presence Grounding
- **Mindset Protocols**: Fudoshin, Clarity (Eye of Storm), Detachment (Observer), Stillness (Gap)
- Uses `[PROTOCOL:somatic:box-breathing-calm]` marker format for interactive cards
- **Rules**: Don't recommend with every exchange, check if already completed, always explain WHY

## E. Wisdom & Framework Integration

The system prompt (lines 530-571) includes:

- **Ancient Wisdom**: Stoicism (Marcus Aurelius, Epictetus, Frankl), Buddhism (Kabat-Zinn, Thích Nhất Hạnh), Samurai Bushido, Greek Philosophy
- **High Performer**: Navy SEALs, Surgeons, Fighter Pilots (OODA), Billie Jean King, Chris Voss, Jeff Bezos
- **Practical Frameworks**: STOP Technique, Name It to Tame It, 90-Second Rule, RAIN, Window of Tolerance
- Uses `[WISDOM:navy-seals:tactical-breathing]` marker format

## F. Questions as Tools

The system prompt explicitly instructs the coach to use questions as the PRIMARY tool (Role 1). Key phrases instructed:
- "What do you think you should do?" (before any suggestion)
- "What's the question beneath the question?"
- "If fear wasn't a factor, what would you do?"
- "What would you tell another CEO in this exact situation?"

This is deeply embedded — the prompt says "The moment you give them the answer, you've failed."

## G. Tiny Wins Tracking

- **AI-driven extraction** runs in-flight during `integrate` and `guided-reflection` flows (lines 2311-2322)
- Uses tool-calling to detect genuine wins from conversation
- Has a WIN_BLOCKLIST to filter false positives
- **Currently working**: 2 wins extracted from coach sessions in DB
- Writes to `tiny_wins` table with `source: 'coach'` and `session_id`

---

## CRITICAL BUGS

### BUG 1 (CRITICAL): Sessions never complete → ALL downstream intelligence is dead

56 of 58 sessions stuck as "active". The 8 post-session analysis functions (insights, summaries, patterns, commitments, memories, probing, breakthroughs, scenarios) have **never executed**.

**Root cause**: `endSession()` relies on explicit user action ("End session" button) AND React state being intact. Users navigate away, or the component unmounts before endSession completes.

**Fix**: Add a `beforeunload`/navigation guard that persists session end. Also add a cleanup mechanism for orphaned sessions (sessions with messages but never ended).

### BUG 2 (HIGH): No AI disclaimer on the coach page

The coach page has no disclaimer identifying it as an AI. Given this is a coaching product, a disclaimer is legally important.

**Fix**: Add a one-line disclaimer at the bottom of the coach interface.

### BUG 3 (MODERATE): Orphaned sessions accumulate

56 sessions stuck as "active" with no cleanup. The `buildServerContext` queries are unaffected (they don't filter by session status), but the `lastSessionSummary` query returns nothing because summaries are never generated.

---

## Fix Plan

### Fix 1: Add cleanup for orphaned sessions + ensure endSession fires reliably

In `src/hooks/useCoachConversation.ts`:
- Capture `messages.length` in a ref so the `endSession` callback always sees the current count
- Add a `useEffect` cleanup that calls `endSession` on unmount if there are messages

In `src/pages/SelfMasteryCoach.tsx`:
- Add `useEffect` cleanup on component unmount that triggers session end

### Fix 2: Clean up existing orphaned sessions (DB migration)

SQL migration to mark sessions with messages but stuck as "active" as "completed" — this won't retroactively generate summaries, but it prevents the count from growing.

### Fix 3: Add AI disclaimer to coach page

In `src/components/coach/CoachSplitView.tsx`, add a small disclaimer line below the input bar in the active conversation view:

```
"AI-powered coaching assistant. Responses are generated and may not always be accurate. Not a substitute for professional advice."
```

Style: `text-[10px] text-muted-foreground/50 text-center` — subtle, non-intrusive.

### Fix 4: Ensure `messages` ref is used in endSession dependency

In `useCoachConversation.ts`, the `endSession` callback at line 387 depends on `messages.length` — but `messages` is state. When `clearConversation` runs at line 570, it sets `messages` to `[]`, creating a race. Fix: use a `messagesRef` that tracks current length.

### Files to change:
1. **`src/hooks/useCoachConversation.ts`** — Add messagesRef, fix endSession race condition
2. **`src/pages/SelfMasteryCoach.tsx`** — Add unmount cleanup effect
3. **`src/components/coach/CoachSplitView.tsx`** — Add AI disclaimer
4. **DB migration** — Clean up 56 orphaned active sessions

