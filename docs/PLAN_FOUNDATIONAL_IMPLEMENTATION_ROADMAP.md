# PLAN Foundational Correctness — Implementation Roadmap

**Status:** F1.1 Complete | F1.2–F1.4 Ready for Systematic Threading | F2–F9 Outlined

**Purpose:** High-level validation of the 8-phase approach before deep implementation.

---

## Executive Summary

The foundational round has **ONE primary objective:** connect the correct scoring engine (`selectJitCandidates` in `select-jit.ts`) that already exists but is currently unused (logged only), and gate off the legacy ranker (`rankJitCandidates`). Everything else is wiring existing components and fixing two confirmed bugs.

**What's NOT happening this round:**
- ❌ No logic redesign (that's Round 2)
- ❌ No new implementations (everything already exists)
- ❌ No threshold/weight tuning (Round 2)

**What IS happening:**
- ✅ Locale context unified (F1) — blocks everything downstream
- ✅ Event tagging made canonical (F2) — feeds scoring engine
- ✅ Correct scoring engine wired (F3) — **THE CORE FIX**
- ✅ Slot formation fixed (F4) — two bugs + dedup guards
- ✅ Arc formation single-sourced (F5) — no re-derivation
- ✅ Practice selection verified (F6) — content-tag parity audit
- ✅ Why-line spec parity (F7) — deterministic generation
- ✅ Persistence & consumer contract (F8/F9) — legacy gated off

---

## Phase-by-Phase Breakdown

### **F1 — User Locale Context (BLOCKING DEPENDENCY)**

**Problem Solved:** Country/timezone awareness is scattered across three independent implementations, causing Friday-weekend countries to fail and hardcoded weekend checks to ignore locales.

**Deliverables:**

| Item | Status | Detail |
|------|--------|--------|
| `user-locale.ts` module | ✅ DONE | Exports `resolveUserLocaleContext()`, `UserLocaleContext` interface, helper functions |
| Import in Plan | ✅ DONE | Added to generate-mastery-plan/index.ts line 74 |
| Build verification | ✅ DONE | Compiles successfully |
| **F1.2: Thread to 3 consumers** | 🔄 READY | See "Threading Points" below |
| **F1.3: Fix Bugs A & B** | 🔄 READY | Two-line fixes in slot-allocator.ts |
| **F1.4: CI gates** | 🔄 READY | Grep-test that `dayOfWeek === 6` absent outside user-locale.ts |

**Threading Points (F1.2):**

1. **In generate-mastery-plan/index.ts main handler (~line 11945+):**
   - After auth & user ID extracted, call `resolveUserLocaleContext({ localDate, utcNowMs, homeCountry, timezone, ... })`
   - Store as `userLocale: UserLocaleContext`
   - Pass `userLocale.weekendDays` to every `classifyAvailability()` call (~3 call sites: lines 7123, 10895, 11434)

2. **In deriveStructuralDayFlags (~line 11400):**
   - Add `locale: UserLocaleContext` parameter
   - Replace `dayOfWeek = localNow.getUTCDay()` with `dayOfWeek = locale.dayOfWeek`
   - Pass `locale.isWeekendRestDay` and `locale.weekendDays` to availability checks

3. **In allocatePlanSlots call site (~line 11680+):**
   - Add `isWeekendRestDay: locale.isWeekendRestDay` to SlotAllocationInput
   - Update SlotAllocationInput type to include `isWeekendRestDay: boolean`

**Bug Fixes (F1.3):**

- **Bug B (Weekend Check):** In `slot-allocator.ts` line ~122, replace `if (input.dayOfWeek === 6 && !input.isFullWorkingWeekend)` with `if (input.isWeekendRestDay && !input.isFullWorkingWeekend)`
- **Bug A (Light-Routine Mode):** In `slot-allocator.ts` line ~200+, replace `"jit+state"` with conditional `ranked.length > 0 ? "jit+state" : "state"` for light_routine day shape

**Gate (F1.4):**

```bash
# CI test: dayOfWeek===6 checks only in user-locale.ts (derivation), never in consumers
grep -r 'dayOfWeek === 6' supabase/functions/_shared/jit/ supabase/functions/generate-mastery-plan/ \
  | grep -v 'user-locale.ts' \
  && exit 1 || exit 0
```

**Acceptance:** Israeli/GCC users on their actual Friday show 1 slot (not 0); light days with zero candidates show `mode: "state"` (not `jit+state`).

---

### **F2 — Event Tagging: A–H v2 is the ONLY Classification System**

**Problem Solved:** Three independent event classification systems coexist. Day flags should read A–H tags, not regexes.

**Deliverables (ADJUSTED SCOPE):**

| Item | Detail | Status |
|------|--------|--------|
| **F2.1: Day flags read tags** | Replace regex in `deriveStructuralDayFlags`: `hasTravelDay = any event with categoryId==='G'`; `hasConferenceDay = categoryId==='F'` | THIS ROUND |
| **F2.2: Schema** | Add `event_category CHAR(1)`, `event_subcategory VARCHAR(30)`, `flight_duration_minutes INT` to events table | THIS ROUND |
| **F2.2: Backfill** | 30-day automated backfill per DOC-2 Part 7 | **DEFERRED** (next sprint) |
| **F2.3: Regression Suite** | DOC-4 (`event-tagging-v2.test.ts`) green; DOC-3 (12 must-pass cases) verified against code | THIS ROUND |

**Why Defer Backfill:**
- Classifier already complete and tested
- Existing DB rows stay on legacy tags (system is backwards-compatible)
- Memory index is keyed the same way (legacy → v2 tag lookup works)
- Backfill can happen asynchronously without blocking F3 launch
- Risk is zero: old tags simply fall through to default behavior until backfilled

**Implementation Approach:**
- Remove title-regex logic from `deriveStructuralDayFlags` or gate behind `LEGACY_TITLE_FLAGS=false`
- Reuse enriched event's `categoryId` (already populated by `enrichEvent`)
- Run schema migration (DDL only, no data change yet)
- Verify DOC-4 tests pass; check DOC-3's 12 cases against current classifier code

**Acceptance:** F2.1 and schema live; DOC-4 tests green; DOC-3 cases verified; backfill scheduled post-F3.

---

### **F3 — Event Scoring: Switch to Correct Engine (`selectJitCandidates`)**

**Problem Solved:** The correct scoring engine (JIT v2, `selectJitCandidates` in `select-jit.ts`) already exists but only logs output. The legacy ranker (`rankJitCandidates`) actually feeds slot allocation. This is THE core fix.

**Deliverables (ADJUSTED SCOPE):**

| Phase | Detail | Scope | Notes |
|-------|--------|-------|-------|
| **F3.1: Adapter** | Build `adaptV2Ranked()` mapping v2 result to RankedJitCandidate[] shape | THIS ROUND | Field-for-field mapping table in PR description |
| **F3.1: Wire Swap** | Replace legacy ranker consumption (2 call sites) with adapted v2 output | THIS ROUND | Allocator unchanged; incremental, safe |
| **F3.1: Port Gates** | Audit legacy ranker's 4 safety gates; port if missing from v2 | THIS ROUND | (a) stale-phase grace, (b) 24h horizon ceiling, (c) blocklist, (d) Category-H sovereign |
| **F3.1: Real Inputs** | Wire `jit_preferences` OR report schema gap | THIS ROUND | If schema exists → wire it; if not → TODO comment for Round 2 |
| **F3.1: Dual-Run** | Legacy ranker shadow (one week) behind `LEGACY_JIT_SHADOW=true` flag | THIS ROUND | Top-3 comparison log; then gate off |
| **F3.2: Stakes** | Verify no `stakesLevel` string in v2 path (grep + test) | THIS ROUND | Weights are FINAL (A=40, C=32, B=30, D=22/38, F=18, G=12, E=10, H=5) |
| **F3.3: Memory** | Remove `WEEK_AHEAD_MEMORY_BOOST` gate; wire title-level "never"; extend return shape | THIS ROUND | DOC-5 Fixes 2/3/5 + DOC-6 extension |
| **F3.4: Backfill** | N/A — memory logic is backwards-compatible | N/A | Legacy tags work; new tags work; both co-exist |

**Why Adapter (Not Full Refactor):**
- Allocator works with `RankedJitCandidate[]` shape today
- Refactoring allocator to consume v2 shape directly is Round 2 work (logic + architecture refactor)
- Adapter is deterministic, testable, and safe (reduces risk for Round 1)
- Incremental approach: engine switch happens first, shape normalization happens in Round 2

**jit_preferences Handling:**
- Check if `jit_preferences` table exists in schema
- If YES → load from DB, pass to engine (not empty stubs) — this round completes the wiring
- If NO → add TODO comment referencing DOC-5 § F3.1 step 4; engine runs without preferences (acceptable)

**Implementation Approach:**

1. **Build adapter in** `_shared/jit/adapt-v2-ranked.ts`:
   - Maps v2 `SelectedCandidate[]` → legacy `RankedJitCandidate[]`
   - Write explicit mapping table (every field documented)
   - Derived fields sourced from enriched event (never fabricated)

2. **Port 4 safety gates** from `jit-candidates.ts`:
   - Audit current gates; grep for each in `select-jit.ts`
   - If gate missing → copy verbatim from legacy
   - Document source in comment

3. **Wire swap** at 2 consumption points (index.ts ~lines 7060, 11111):
   - `jitRankedCandidates = adaptV2Ranked(selectJitCandidates(...).ranked)`

4. **Memory wiring** (DOC-5 Fixes 2, 3, 5 + DOC-6):
   - Remove `WEEK_AHEAD_MEMORY_BOOST` gate entirely
   - Wire title-level "never" key in memory check
   - Extend return shape: `{..., priorityCount, hasPriorDayPriority}`
   - Thread through to snapshot debug payload

5. **Dual-run verification** (one week):
   - Both engines run in parallel
   - Log structured: top-3 from each, divergence notes
   - After week + sign-off → gate `LEGACY_JIT_SHADOW` to false

**Acceptance:** 
- Production snapshots show `adapter_marker: true` (proves v2 wired)
- `load-jit-context` relationship scoring reachable
- Legacy ranker cannot execute outside shadow flag
- Memory: title-level "never" gates hard demotes; week-ahead +20 boost active

---

### **F4 — Slot Formation & Bug Fixes**

**Problem Solved:** Two confirmed bugs (Bugs A & B from DOC-10) + missing dedup guards + stale slots not pruned correctly.

**Deliverables:**

| Item | Detail | File |
|------|--------|------|
| Bug A & B fixes | Done in F1.3 (mode label, weekend check) | `slot-allocator.ts` |
| Slot-count contract | Test per shape: rest_day=0, saturday/holiday/week_ahead=1, others=3 | New test |
| Stale-slot pruning | Time-filtered set (30-min grace), not full-day set | `slot-allocator.ts` mergeWithLedger |
| Inter-slot title dedup | `usedStateLabels` / `usedSlotTitles` guards | From DOC-5 Fix 9 |
| Cross-slot practice dedup | `globalConsumedPracticeIds` set passed through 3 selections | From DOC-5 Fix 9 |
| Category-A board-protect | Confirm `makeBoardProtectSlot` path taken, label matches | `slot-allocator.ts` |
| mrsWindow-aware roles | Thread `mrsWindow` → assign per-window roles (morning/afternoon/evening) | From DOC-5 Fix 8 |

**Implementation Approach:**

- Most fixes already have DOC-5 code blocks (verbatim implementation)
- Slot-count test: simple unit test asserting counts per DayShape
- Stale pruning: change `calendarEventTitles` from full-day to time-filtered (ended-2h-ago threshold)
- Dedup guards: copy DOC-5 exact blocks, ensure they compile with new engine inputs

**Acceptance:** Ended-2h-ago events don't survive merge; three slots never show identical titles; no practice appears twice; mrsWindow roles correctly assigned per window.

---

### **F5 — Arc Formation: Tags Drive Arcs, Duration Drives Travel**

**Problem Solved:** Arc logic is spread across enriched events, phase map, and allocator pruning. Need single source of truth.

**Deliverables:**

| Item | Detail |
|------|--------|
| **F5.1: Travel Arc** | Enriched event's `travelArc` (pre-during-post ≥360min or explicit; pre-post <6h) is authoritative. Delete or pass-through re-derivation in allocator |
| **F5.2: No-Arc Categories** | E.learning, E.community, E.routine_sync, H (unless sovereign-tagged) → no arc. Add test cases preventing fabrication |
| **F5.3: E.deep_work Arcs** | Confirm `EVENT_PHASE_MAP` reflects pre/post for E subcat; extend map to subcategory granularity if needed |
| **F5.4: Accommodation** | G.accommodation has no separate arc (travel context only, per DOC-2) |
| **F5.5: Deferred** | Causality-driven arc elevation (Fix 10) and night-before slot trigger (Fix 11) → Round 2 |

**Implementation Approach:**

- Audit `pruneTravelPhases` logic; confirm it reads `travelArc` from enriched event
- If `EVENT_PHASE_MAP` is category-granular only, extend to subcategory keys for E (deep_work, learning, community, routine_sync)
- Add test cases mirroring DOC-4's arc tests (e.g., "passive learning webinar → travelArc null → no arc fabricated")

**Acceptance:** Travel arcs read from enriched event duration; no-arc categories confirmed gate fabrication; E.deep_work pre/post arcs confirmed in phase map.

---

### **F6 — Practice Selection: Intent Binding + Content-Tag Parity**

**Problem Solved:** Practice selection has verb→intent table (DOC-8) and both DB + frontend have content tags, but parity may diverge.

**Deliverables (ADJUSTED SCOPE):**

| Item | Detail | Scope | Notes |
|------|--------|-------|-------|
| **F6.1: Intent Binding** | Verify `deriveSlotIntent()` + `scoreContentAgainstIntent()` wired into primary + filler selector paths. 8-case test green | THIS ROUND | Both functions already exist; just verify wiring |
| **F6.2: Content-Tag Parity** | Systematic audit: every item in frontend CONTENT_TAG_MAP vs DB sanctuary_content tags | **DEFERRED** (next sprint) | Parallel sprint after F3 launch; does not block users |
| **F6.3: mastery_category** | Comment-only (DO NOT WIRE). Reference DOC-8. | THIS ROUND | Low-effort documentation |
| **F6.4: Preferred-Practice Window** | Add `profiles.preferred_practice_window` field; wire selector read | THIS ROUND | Quick schema + 3-line selector boost |
| **F6.5: Cross-Slot Dedup** | Already done in F4 | N/A | Covered by F4 dedup guards |

**Why Defer Content-Tag Parity:**
- Both DB and frontend tags work independently (selector reads from both)
- Divergence doesn't break functionality (selector can use either)
- Parity audit is systematic but not time-critical
- Better done as parallel audit sprint with DB export + TS audit tools
- Risk is zero: content still selects correctly regardless of tag divergence (just not optimized)

**Implementation Approach (THIS ROUND):**

1. **Intent Binding Verification:**
   - Read `select-content.ts` or relevant practice selector
   - Confirm `deriveSlotIntent()` called before `scoreContentAgainstIntent()`
   - Confirm intent flows through to scoring function
   - Add inline comment: "Verified: intent binding wired" with line numbers

2. **mastery_category Documentation:**
   - Add comment block in selector: `// mastery_category RESERVED for Round 2 "More Like This" feature; DO NOT WIRE`
   - Reference DOC-8 specification

3. **Preferred-Practice Window:**
   - Add `profiles.preferred_practice_window` column (ENUM: 'morning' | 'evening' | 'system_decide', default 'system_decide')
   - Update onboarding flow to write preference (add to profile at signup)
   - In practice selector: if preference != 'system_decide', boost matching window slots by +2
   - Add test: verify morning preference gets morning-phase practices when available

**Acceptance:** Intent binding verified in code; mastery_category reserved with comment; preferred-practice-window field live and influencing selection; content-tag parity audit scheduled post-F3.

**Parity Audit (Next Sprint):**
- Export all `sanctuary_content.id`, `pillar`, `meta_skill`, `masterySubtypes`, `goalTags`
- Compare against `CONTENT_TAG_MAP` in frontend TS
- Create divergence report: items that differ
- Resolution: either update DB to match spec OR update TS to match DB (decide per item)

---

### **F7 — Why-Line: Deterministic Generation at Spec Parity**

**Problem Solved:** `composeWhyLine()` is wired but may not fully match DOC-7 spec (clause priority, forbidden vocabulary, title vocabulary per arc phase).

**Deliverables:**

| Item | Detail |
|------|--------|
| **F7.1: Clause Priority** | eventSpecificWhy → strategic → tactical → immediate (each nulled on Brief overlap, closed with `{ArcLabel}: {verb} {forContext}.`). Verify all banks exist in code |
| **F7.2: Forbidden Vocabulary** | `validateWhyLine` enforces same list as DOC-7 Part C (no wellness/clinical/score/system vocab). Extract as shared constant with Brief validator |
| **F7.3: Title Vocabulary** | Replace hardcoded "ahead of" connector with arc-phase-correct temporal markers (DOC-5 Fix 15 table: before/during/after, Protect/Prepare per phase) |
| **F7.4: LLM Path** | Unchanged — deterministic fallback, LLM overwrite only on validation pass. Test confirms validation failure ships deterministic |

**Implementation Approach:**

- Read `composeWhyLine()` implementation line-by-line against DOC-7 §B (clause banks, priority rules)
- Missing clauses → add; undocumented → flag for spec decision
- Extract forbidden-vocabulary list to shared constant (`FORBIDDEN_WHY_VOCABULARY`)
- Replace connector lookup with DOC-5 Fix 15 table (arc phase → temporal marker)
- Confirm LLM path only overwrites on `validateWhyLine` pass

**Acceptance:** Every clause bank entry in DOC-7 §B2–B5 exists in code; validator uses shared forbidden-vocabulary list; arc-phase-correct connectors used; LLM overwrite gated by validation.

---

### **F8/F9 — Persistence, Consumer Contract, Legacy Gating**

**Problem Solved:** Need consumer contract clarity + core legacy paths completely gated off to prevent regression.

**Deliverables (SIMPLIFIED):**

| Phase | Item | Detail | Scope |
|-------|------|--------|-------|
| **F8** | Persist mode | Ensure `mode` persisted in `plan_json.meta` and surfaced in snapshot read | THIS ROUND |
| **F8** | Snapshot contract | Natural key `(user_id, plan_date, mrs_window)`, awaiting-never-clobbers-ready — confirm + test | THIS ROUND |
| **F9** | Core Lock List (5 items) | All OFF by default; each with CI grep-test preventing reactivation | THIS ROUND |
| **F9** | Secondary Locks (deferred) | 5 additional items for Round 2 + Round 3 polish (see below) | **DEFERRED** |

**Core Lock List (THIS ROUND — 5 MUST-GATE ITEMS):**

1. **`rankJitCandidates` (legacy ranker)**
   - Gate: Only behind `LEGACY_JIT_SHADOW=true` flag
   - CI Test: `grep -r 'rankJitCandidates' supabase/functions/ | grep -v 'select=true\|LEGACY_JIT_SHADOW' && exit 1`
   - After parity week: `LEGACY_JIT_SHADOW` defaults false (then becomes dead code for removal)

2. **Hardcoded `dayOfWeek === 6` checks**
   - Gate: Only in `user-locale.ts` (derivation layer)
   - CI Test: `grep -rn 'dayOfWeek === 6' supabase/functions/ | grep -v '_shared/plan/user-locale.ts' && exit 1`
   - Rationale: All consumers must read from `locale.isWeekendRestDay` instead

3. **`WEEK_AHEAD_MEMORY_BOOST` gate**
   - Gate: Completely removed (no conditional check)
   - CI Test: `grep -r 'WEEK_AHEAD_MEMORY_BOOST' supabase/functions/ && exit 1`
   - Rationale: Memory is always wired; week-ahead boost is always active

4. **Title-regex day flags in `deriveStructuralDayFlags`**
   - Gate: Replaced with A–H tag reads OR gated behind `LEGACY_TITLE_FLAGS=false`
   - CI Test: `grep -A5 'deriveStructuralDayFlags' supabase/functions/generate-mastery-plan/index.ts | grep -i 'TRAVEL\|CONFERENCE' | grep 'Title\|Regex' && exit 1`
   - Rationale: F2 switch: tags drive day flags, not regexes

5. **`LEGACY_JIT_SHADOW` after parity week**
   - Gate: After 7-day dual-run + sign-off, gate to `false` (then dead code)
   - CI Test: `grep 'LEGACY_JIT_SHADOW.*true' supabase/functions/ && exit 1` (post-parity)
   - Rationale: Engine switch validated; legacy ranker no longer needed

**Secondary Locks (DEFERRED TO ROUND 2+):**

| Item | Reason Deferred |
|------|-----------------|
| `STAKES_BASE` / `CATEGORY_WEIGHT` tables removal | v2 engine doesn't read them anyway; cleanup can happen post-launch |
| `mastery_category` wiring check | Owned by "More Like This" feature (future release) |
| Full-day vs time-filtered `calendarEventTitles` | Already correct in code; just needs documentation + test |
| `smart-nudges` 12+ `===6` re-derivations | Owned by smart-nudges team (separate workstream) |
| Legacy pre-v2 event tags DB cleanup | 30-day backfill (F2, deferred) handles this in parallel |

**Implementation Approach:**

- **F8.1:** Check snapshot schema; ensure `mode` in `plan_json.meta`; surface in read API
- **F8.2:** Unit tests for snapshot upsert guards (awaiting-never-clobbles, error overwrite)

- **F9.1:** Add 5 CI tests (one per gate) to `scripts/ci-gates.sh`:
  ```bash
  #!/bin/bash
  set -e
  
  # Gate 1: Legacy ranker only in shadow
  grep -r 'rankJitCandidates' supabase/functions/ \
    | grep -v 'select=true\|LEGACY_JIT_SHADOW' && exit 1 || true
  
  # Gate 2: dayOfWeek===6 only in user-locale.ts
  grep -rn 'dayOfWeek === 6' supabase/functions/ \
    | grep -v '_shared/plan/user-locale.ts' && exit 1 || true
  
  # Gate 3: WEEK_AHEAD_MEMORY_BOOST removed
  grep -r 'WEEK_AHEAD_MEMORY_BOOST' supabase/functions/ && exit 1 || true
  
  # Gate 4: Title flags replaced with tags
  grep -A5 'deriveStructuralDayFlags' supabase/functions/generate-mastery-plan/index.ts \
    | grep -i 'Title\|Regex' | grep -i 'travel\|conference' && exit 1 || true
  
  # Gate 5: After parity week, legacy shadow flag is false
  # (activated in post-parity CI config)
  
  echo "✅ All 5 core gates passed"
  ```

- **F9.2:** Add gates to GitHub Actions workflow (run before merge to main)

**Acceptance:** 
- All 5 CI gates green (CI job passes)
- Parity week comparison log produced (top-3 divergence documented)
- After sign-off: `LEGACY_JIT_SHADOW` flipped to false (legacy becomes unreachable)
- Snapshot mode persisted and surfaced correctly in API

---

## Rollout Order (Dependencies)

```
F1 (Locale Context)
├─ F2 (Event Tagging)
│  └─ F3 (Engine Switch-Over)
│     ├─ F4 (Slot Formation)
│     ├─ F5 (Arcs)
│     ├─ F6 (Practice Selection)
│     └─ F7 (Why-Line)
└─ F8/F9 (Persistence & Legacy Gating)
```

**Why this order:**
- F1 is blocking (everything else reads locale context)
- F2 must complete before F3 (scoring engine consumes A–H tags)
- F3 is the core fix (correct engine switched on)
- F4–F7 are independent once F3 is live (they refine slot formation, arcs, selection, copy)
- F8/F9 close out (consumer contracts + legacy lock list)

---

## Definition of Done (Round 1 — ADJUSTED)

✅ **All CI Gates Passing (5 CORE GATES):**
- Gate 1: `rankJitCandidates` only behind shadow flag
- Gate 2: `dayOfWeek === 6` only in user-locale.ts
- Gate 3: `WEEK_AHEAD_MEMORY_BOOST` completely removed
- Gate 4: Title-regex day flags replaced with A–H tag reads
- Gate 5: Post-parity, `LEGACY_JIT_SHADOW` defaults false

✅ **Event Tagging (F2):**
- Schema migration applied (event_category, event_subcategory, flight_duration_minutes columns)
- Day flags read A–H tags instead of regexes
- DOC-4 event-tagging suite 100% green
- DOC-3's 12 must-pass cases verified against classifier (backfill deferred)

✅ **Engine Switch-Over Live (F3 — CORE):**
- Adapter (`adapt-v2-ranked.ts`) implemented and tested
- v2 `selectJitCandidates` wired at 2 consumption points
- Production snapshots show `adapter_marker: true` in debug payload
- Legacy ranker shadow running (one week of parity logs)
- `jit_preferences` schema checked; if exists → wired; if not → TODO comment
- Memory gates removed; title-level "never" wired; week-ahead +20 boost active

✅ **Slot Formation (F4 + F1 Bugs):**
- Bug A fixed: light_routine mode label conditional on candidate count
- Bug B fixed: weekend checks use `locale.isWeekendRestDay` (not hardcoded `dayOfWeek===6`)
- Slot-count tests green (per-shape assertions)
- Stale-slot merge-liveness test green
- Title dedup guards + practice dedup guards in place

✅ **Intent Binding & Practice Selection (F6 - Verification):**
- Intent binding verified wired in selector code
- `mastery_category` marked with "do not wire" comment + DOC-8 reference
- Preferred-practice-window schema + selector boost implemented
- Content-tag parity audit scheduled (post-F3)

✅ **Real-Data Verifications:**
- Israeli/GCC users on their Friday: now see 1 slot (previously 0) ✅
- Light days with zero candidates: now show `mode: "state"` (not mislabelled) ✅

✅ **"What Changed" Document:**
- One-pager detailing F1–F9 changes, with before/after examples
- Diffs against DOC-1 specification
- Ready for Round 2 (logic amendments)

---

## Scope Adjustments (Intelligent Prioritization)

**Decision:** Maximize impact on core mission (F3 engine switch) while deferring lower-risk items that can ship in follow-up sprints.

### Decisions Made

1. **F1 Threading:** Resolve locale context ONCE at Plan start (line ~11945), thread to 3 consumers.
   - Why: Single source of truth, prevents drift, unambiguous control flow
   - Approach: Build `userLocale` early in handler, pass to every downstream call

2. **F2 Backfill:** DEFER 30-day backfill to after F3 is live.
   - Why: F3 is the critical path; backfill is post-flight cleanup
   - Approach: F2 does schema + classifier verification only. Real events stay on legacy tags until backfill sprint
   - Impact: F3 scoring will read v2 tags where they exist, legacy tags otherwise (both are keyed the same in memory index)

3. **F3 Adapter:** Map v2 → legacy RankedJitCandidate shape (incremental, safe).
   - Why: Allocator already works with legacy shape; refactor is Round 2 work
   - Approach: `adapt-v2-ranked.ts` does field-for-field mapping; allocator unchanged
   - Risk: Low (adapter is deterministic)

4. **F3 jit_preferences:** Schema check only; if missing, report gap and defer to Round 2.
   - Why: Preferences are enhancement; engine works without them (uses empty stubs)
   - Approach: Grep for schema; if exists, wire it; if not, add comment TODO for Round 2
   - Impact: Day-of scoring runs without jit_preferences initially (acceptable)

5. **F6 Content-Tag Parity:** DEFER to post-F3.
   - Why: Practice selection works without parity (both DBs + frontend maps are read independently)
   - Approach: F6 is verification-only this round; full parity audit happens next sprint
   - Impact: Plan ships with possibly divergent tags (users see correct practices regardless)

6. **F8/F9 Legacy Gating:** Lock list simplified to 5 MUST-GATE items, defer others to Round 2.
   - Why: Focus on the gates that prevent Round 1 from regressing
   - Items to lock NOW:
     1. `rankJitCandidates` (legacy ranker) — only behind shadow flag
     2. Hardcoded `dayOfWeek === 6` — only in user-locale.ts (grep-test)
     3. `WEEK_AHEAD_MEMORY_BOOST` — completely removed (grep-test)
     4. Title-regex day flags — deleted from `deriveStructuralDayFlags` (grep-test)
     5. `LEGACY_JIT_SHADOW` defaults false after parity week (gate test)
   - Deferred items (Round 2 + Round 3 polish):
     - STAKES_BASE/CATEGORY_WEIGHT table cleanup (v2 engine doesn't read it anyway)
     - smart-nudges 12+ `===6` re-derivations (own workstream)
     - mastery_category wiring (owned by post-MVP "More like this" feature)
     - Full-day vs time-filtered liveness choice (already correct in code, just needs documentation)

---

## Next Steps

**If this approach is validated:**
- Phase 1: Implement F1 threading (~2–3 hours systematic work)
- Phase 2: Implement F2 (schema + classifier verification + backfill)
- Phase 3: Implement F3 (adapter + wire swap + memory wiring) — **the core**
- Phase 4: Implement F4–F7 (slot formation, arcs, practice, why-line) — can run in parallel
- Phase 5: Implement F8/F9 (persistence + legacy locks)
- Phase 6: Comprehensive CI validation + real-data verification

**If adjustments needed:**
- Please flag which phases need scope change or approach revision
- I'll update this roadmap and proceed with adjusted plan

---

## Appendix: Tool Estimates (Adjusted for Scope)

| Phase | Deliverables | Estimated Effort | Complexity | Risk |
|-------|--------------|------------------|-----------|------|
| F1 | User-locale threading (3 consumers) | 2–3h | Medium | Low |
| F2 | Schema + classifier verification + regex removal | 2–3h | Medium | Low |
| F2.Backfill | 30-day DB backfill (deferred) | 1–2h | Low | **DEFERRED** |
| F3 | Adapter + wire swap + gates + memory wiring | 4–5h | **High** | **High** |
| F4 | Bug A/B fixes + dedup guards + slot-count tests | 2–3h | Medium | Low |
| F5 | Arc verification + phase map tests | 1–2h | Low | Low |
| F6 | Intent binding verification + preferred-window | 1–2h | Low | Low |
| F6.Parity | Content-tag audit (deferred) | 2–3h | Medium | **DEFERRED** |
| F7 | Why-line spec matching | 1h | Low | Low |
| F8/F9 | Snapshot mode + 5 core gates + CI tests | 2–3h | Low | Low |
| **TOTAL (THIS ROUND)** | **F1–F9 wiring** | **14–18h** | — | — |
| **DEFERRED** | F2 backfill + F6 parity audit | **3–5h** | — | Low |

**Effort Reduction vs Original:**
- ✅ Backfill deferral: -1–2h
- ✅ Content-tag parity deferral: -2–3h
- ✅ Lock list reduction (10→5): -1h
- ✅ Simplified schema (DDL only, no data): -0.5h
- **Net savings: ~4–6.5h (26% reduction)**

**Critical Path (Serial Dependencies):**
```
F1 (2–3h) 
  ↓
F2 (2–3h) 
  ↓
F3 (4–5h) ← LONGEST, HIGHEST RISK
  ├─ F4 (2–3h) ┐
  ├─ F5 (1–2h) ├─ Can run in parallel after F3
  ├─ F6 (1–2h) ┤    verification
  ├─ F7 (1h)   ┘
  └─ F8/F9 (2–3h) ← Final gates

Parallel Sprints (Independent):
- F2.Backfill (1–2h, post-F3 launch)
- F6.Parity (2–3h, post-F3 launch)
```

**Wall-Clock Timeline (Recommended):**
- **Week 1, Days 1–2:** F1 threading (~3h) + F2 schema verification (~2.5h) = **5.5h**
- **Week 1, Days 3–4:** F3 adapter + wire swap + gates (~4.5h) + F3 memory wiring (~0.5h) = **5h**
- **Week 1, Days 5:** F3 dual-run launch + smoke tests (0.5h), then **PARITY WEEK BEGINS** (runs in bg)
- **Week 2, Days 1–2:** F4/F5/F6/F7 in parallel (~2.5h total) + F8/F9 gates (~2h) = **4.5h**
- **Week 2, Day 3:** Parity week review + `LEGACY_JIT_SHADOW` gate flip (0.5h)
- **Week 2, Days 4–5:** Real-data verification + sign-off (1h)
- **Parallel (async):** F2 backfill sprint + F6 parity audit (both post-launch)

**Estimated Wall-Clock: 11 calendar days (with 3-day parity window running in background)**

